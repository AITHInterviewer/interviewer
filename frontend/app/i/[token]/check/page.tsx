"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { CandidateGate } from "@/components/chrome/CandidateGate";
import { Button } from "@/components/ui/button";
import { markForwardProgress, routeParam } from "@/lib/candidate-flow";

const BAR_COUNT = 12;

type MicCheckStatus = "idle" | "checking" | "granted" | "denied" | "missing" | "busy";

function micStatusFromCause(cause: unknown): { status: Exclude<MicCheckStatus, "idle" | "checking" | "granted">; message: string } {
  const name = cause instanceof DOMException ? cause.name : "";
  if (name === "NotFoundError") {
    return {
      status: "missing",
      message: "Микрофон не найден. Подключите микрофон и проверьте снова.",
    };
  }
  if (name === "NotReadableError") {
    return {
      status: "busy",
      message: "Микрофон уже используется другим приложением. Закройте его и проверьте снова.",
    };
  }
  if (name === "NotAllowedError") {
    return {
      status: "denied",
      message:
        "Доступ к микрофону запрещён. Разрешите микрофон для этого сайта в настройках браузера и нажмите «Проверить микрофон» ещё раз.",
    };
  }
  return {
    status: "denied",
    message: cause instanceof Error ? cause.message : "Не получилось проверить микрофон. Попробуйте ещё раз.",
  };
}

export default function CheckPage() {
  const token = routeParam(useParams<{ token: string }>().token);
  const router = useRouter();

  return (
    <CandidateGate token={token} current="Проверка" redirectCompleted requireConsented>
      {(_info, accessToken) => (
        <CheckBody
          accessToken={accessToken}
          onContinue={() => router.push(`/i/${accessToken}/rules`)}
        />
      )}
    </CandidateGate>
  );
}

function CheckBody({ accessToken, onContinue }: { accessToken: string; onContinue: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micStatus, setMicStatus] = useState<MicCheckStatus>("idle");
  const [micMessage, setMicMessage] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [barLevels, setBarLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopMicPreview = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startMicPreview = useCallback((stream: MediaStream) => {
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const sample of data) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      setMicLevel(Math.min(1, rms * 4));
      analyser.getByteFrequencyData(freqData);
      setBarLevels(
        Array.from({ length: BAR_COUNT }, (_, i) => freqData[Math.min(freqData.length - 1, i * 8)] / 255),
      );
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => () => stopMicPreview(), [stopMicPreview]);

  async function checkMicrophone() {
    setMicStatus("checking");
    setMicMessage(null);
    stopMicPreview();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startMicPreview(stream);
      setMicStatus("granted");
      setMicMessage("Микрофон разрешён.");
    } catch (cause) {
      const result = micStatusFromCause(cause);
      setMicStatus(result.status);
      setMicMessage(result.message);
    }
  }

  return (
    <section className="setup-stage" style={{ width: "100%" }}>
      <p className="path">Проверка</p>
      <h1>Проверьте себя перед стартом</h1>
      <p>Для голосовых ответов нужен микрофон. Камера не обязательна.</p>
      <p>
        Выберите тихое место и проверьте интернет. Наушники или динамик помогут слышать вопросы.
      </p>

      {micStatus === "checking" || micStatus === "granted" ? (
        <div className="device-check">
          <div
            className="wave-bars"
            role="meter"
            aria-label="Уровень микрофона"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(micLevel * 100)}
          >
            {barLevels.map((level, index) => (
              <i key={index} style={{ height: `${Math.max(4, Math.round(level * 54))}px` }} />
            ))}
          </div>
          <span className="text-[13px] text-[var(--ink-secondary)]">
            {micStatus === "checking" ? "Проверяем микрофон…" : micMessage}
          </span>
        </div>
      ) : null}

      {micStatus === "denied" || micStatus === "missing" || micStatus === "busy" ? (
        <p className="field__error">{micMessage}</p>
      ) : null}

      <Button
        type="button"
        variant={micStatus === "granted" ? "secondary" : "primary"}
        disabled={micStatus === "checking"}
        onClick={() => void checkMicrophone()}
      >
        {micStatus === "checking" ? "Проверяем…" : "Проверить микрофон"}
      </Button>

      <div className="camera-mini">
        Камеру можно не включать — интервью от этого не закроется.
      </div>

      <div className="setup-stage__footer">
        <Button
          type="button"
          size="large"
          disabled={busy || micStatus !== "granted"}
          onClick={async () => {
            if (micStatus !== "granted") return;
            setBusy(true);
            setError(null);
            try {
              await markForwardProgress(accessToken, "device_checked");
              stopMicPreview();
              onContinue();
            } catch {
              setError("Не получилось сохранить шаг. Проверьте соединение и попробуйте ещё раз.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Сохраняем…" : "Дальше, к правилам"}
        </Button>
      </div>
      {micStatus !== "granted" && micStatus !== "checking" ? (
        <p className="text-[13px] text-[var(--ink-secondary)]">Сначала проверьте микрофон.</p>
      ) : null}
      {error ? <p className="field__error">{error}</p> : null}
    </section>
  );
}
