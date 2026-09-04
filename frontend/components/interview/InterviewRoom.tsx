"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { speak, transcribe } from "@/lib/voice";

type TurnResponse = {
  text: string | null;
  done: boolean;
  phase: string;
  question_id: string | null;
  question_text: string | null;
  question_index: number;
  questions_total: number;
  vacancy_title?: string;
};

type RoomPhase = "idle" | "agent_speaking" | "listening" | "thinking" | "done" | "error";

type TranscriptEntry = { who: "agent" | "candidate"; text: string };

/** Ниже этого RMS считаем, что кандидат молчит. Подобрано под обычный ноутбучный микрофон. */
const SILENCE_RMS = 0.02;
/** Сколько тишины подряд означает «ход закончен». В боевом контуре это делает Silero VAD. */
const SILENCE_MS = 1800;
/** Не отправляем в STT совсем короткие обрывки — почти всегда это шум. */
const MIN_SPEECH_MS = 700;

export function InterviewRoom({ sessionId, stream }: { sessionId: string; stream: MediaStream | null }) {
  const [phase, setPhase] = useState<RoomPhase>("idle");
  const [question, setQuestion] = useState<string | null>(null);
  const [agentLine, setAgentLine] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const stopListeningRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  /** Проигрывает реплику агента и ждёт её окончания — кандидат не должен отвечать в пустоту. */
  const playAgent = useCallback(async (text: string) => {
    setPhase("agent_speaking");
    setAgentLine(text);
    setTranscript((prev) => [...prev, { who: "agent", text }]);
    try {
      await speak(text);
    } catch {
      // TTS может быть не поднят — не срываем интервью, показываем текст на экране.
    }
  }, []);

  /** Пишет ответ кандидата до паузы (клиентский детектор тишины вместо VAD). */
  const recordAnswer = useCallback(async (): Promise<Blob | null> => {
    if (!stream) return null;
    setPhase("listening");

    return new Promise<Blob | null>((resolve) => {
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      const AudioContextCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const audioContext = AudioContextCtor ? new AudioContextCtor() : null;
      const analyser = audioContext?.createAnalyser();
      if (audioContext && analyser) {
        audioContext.createMediaStreamSource(stream).connect(analyser);
        analyser.fftSize = 512;
      }
      const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

      const startedAt = Date.now();
      let lastLoudAt = Date.now();
      let raf: number | null = null;

      const finish = () => {
        if (raf !== null) cancelAnimationFrame(raf);
        stopListeningRef.current = null;
        audioContext?.close().catch(() => {});
        if (recorder.state !== "inactive") recorder.stop();
      };

      recorder.onstop = () => {
        recorderRef.current = null;
        resolve(chunks.length > 0 ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null);
      };

      const tick = () => {
        if (analyser && data) {
          analyser.getByteTimeDomainData(data);
          let sumSquares = 0;
          for (const sample of data) {
            const normalized = (sample - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / data.length);
          if (rms > SILENCE_RMS) lastLoudAt = Date.now();
        }

        const elapsed = Date.now() - startedAt;
        const silentFor = Date.now() - lastLoudAt;
        if (elapsed > MIN_SPEECH_MS && silentFor > SILENCE_MS) {
          finish();
          return;
        }
        raf = requestAnimationFrame(tick);
      };

      // Ручная кнопка «Готово» — страховка, если детектор тишины не сработал.
      stopListeningRef.current = finish;
      recorder.start();
      raf = requestAnimationFrame(tick);
    });
  }, [stream]);

  /**
   * Один круг разговора. Обратите внимание: решение о том, что будет дальше — уточнение,
   * подсказка, следующий вопрос или конец интервью — целиком принимает граф на стороне
   * live-agent (spec FR-008/FR-011). Здесь нет ни одной ветки вида «если ответ короткий,
   * спросить ещё раз»: фронтенд только озвучивает то, что вернул `submitTurn`.
   */
  const runTurn = useCallback(async () => {
    const audio = await recordAnswer();
    if (!audio) return;

    setPhase("thinking");
    const said = await transcribe(audio);
    if (said) setTranscript((prev) => [...prev, { who: "candidate", text: said }]);

    const result = await apiFetch<TurnResponse>(`/mock-interview/session/${sessionId}/turn`, {
      method: "POST",
      body: JSON.stringify({ text: said }),
    });

    setProgress({ index: result.question_index + 1, total: result.questions_total });
    if (result.question_text) setQuestion(result.question_text);

    if (result.text) {
      await playAgent(result.text);
    }
    if (result.done) {
      setPhase("done");
      return;
    }
    setPhase("listening");
  }, [playAgent, recordAnswer, sessionId]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const result = await apiFetch<TurnResponse>(`/mock-interview/session/${sessionId}/start`, { method: "POST" });
      setQuestion(result.question_text);
      setProgress({ index: result.question_index + 1, total: result.questions_total });
      await playAgent(result.text ?? "");
      setPhase("listening");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось начать интервью");
      setPhase("error");
    }
  }, [playAgent, sessionId]);

  // Пока идёт интервью — крутим круги «слушаем → распознаём → отвечаем» без участия кнопок.
  useEffect(() => {
    if (phase !== "listening") return;
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await runTurn();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Ошибка во время интервью");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- перезапуск круга только по смене фазы
  }, [phase]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
        <div className="flex min-h-[220px] flex-col justify-center gap-4 rounded-xl border bg-card p-6">
          {progress && (
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Вопрос {progress.index} из {progress.total}
            </p>
          )}
          <p className="text-xl font-medium leading-snug">{question ?? "Интервью ещё не начато"}</p>
          {agentLine && agentLine !== question && (
            <p className="text-sm text-muted-foreground">{agentLine}</p>
          )}
          <StatusLine phase={phase} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="space-y-3">
          <div className="aspect-video overflow-hidden rounded-xl border bg-muted/30">
            {/* Тайл кандидата — своя камера. */}
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          </div>
          <div
            className={`flex aspect-video items-center justify-center rounded-xl border text-sm ${
              phase === "agent_speaking" ? "border-primary bg-primary/10 text-primary" : "bg-muted/30 text-muted-foreground"
            }`}
          >
            {phase === "agent_speaking" ? "Интервьюер говорит…" : "Интервьюер"}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        {phase === "idle" && (
          <Button type="button" onClick={start}>
            Начать интервью
          </Button>
        )}
        {phase === "listening" && (
          <Button type="button" variant="outline" onClick={() => stopListeningRef.current?.()}>
            Готово, я ответил
          </Button>
        )}
      </div>

      {transcript.length > 0 && (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">Расшифровка разговора</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {transcript.map((entry, index) => (
              <li key={index}>
                <span className="font-medium">{entry.who === "agent" ? "Интервьюер" : "Вы"}:</span> {entry.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function StatusLine({ phase }: { phase: RoomPhase }) {
  const label: Record<RoomPhase, string> = {
    idle: "Нажмите «Начать интервью»",
    agent_speaking: "Интервьюер говорит…",
    listening: "Слушаем вас — говорите, пауза завершит ответ",
    thinking: "Обрабатываем ответ…",
    done: "Интервью завершено. Спасибо, ответы отправлены на обработку.",
    error: "Что-то пошло не так",
  };
  return <p className="text-sm text-muted-foreground">{label[phase]}</p>;
}
