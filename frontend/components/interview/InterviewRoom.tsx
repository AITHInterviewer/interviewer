"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { ControlChannel, type ChannelState } from "@/lib/control-channel";
import { LiveKitSession, type AgentPresence } from "@/lib/livekit-client";

type LiveKitTokenResponse = { token: string; room_name: string; ws_url: string; expires_at: string };

/**
 * US2/US3 (specs/004-candidate-interview-flow) — видеозвонок-подобный экран интервью.
 * Единственные источники того, что показывать: `ControlChannel` (текст вопроса/фаза,
 * FR-008/FR-009/FR-011 — никакой локальной логики переходов здесь) и `LiveKitSession`
 * (только присутствие/озвучка агента, FR-012 — медиа отдельно от control-трафика).
 *
 * Answer-upload (`MediaRecorder` по вопросам) и live_coding-редактор — не реализованы в
 * этой итерации (см. tasks.md, T020/T021, T033-T036) — вакансия/вопросы для первого
 * сквозного прогона захардкожены на стороне live-agent, все вопросы формата `voice`.
 */
export function InterviewRoom({
  sessionId,
  stream,
  initialSpeakerId,
}: {
  sessionId: string;
  stream: MediaStream | null;
  initialSpeakerId?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const liveKitRef = useRef<LiveKitSession | null>(null);
  const [channelState, setChannelState] = useState<ChannelState>({ status: "connecting" });
  const [agentPresence, setAgentPresence] = useState<AgentPresence>("absent");
  const [error, setError] = useState<string | null>(null);
  const candidateSpeaking = useMicSpeaking(stream);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (!stream) return;
    let cancelled = false;
    const channel = new ControlChannel(sessionId);
    const liveKit = new LiveKitSession();
    liveKitRef.current = liveKit;
    let unsubscribePresence: (() => void) | null = null;

    const unsubscribeChannel = channel.subscribe(setChannelState);
    channel.connect();

    apiFetch<LiveKitTokenResponse>(`/interview/${sessionId}/livekit-token`, { method: "POST" })
      .then((tokenResponse) => {
        if (cancelled) return undefined;
        return liveKit.connect(tokenResponse.ws_url, tokenResponse.token, stream, initialSpeakerId);
      })
      .then(() => {
        if (cancelled) return;
        unsubscribePresence = liveKit.onAgentPresenceChange(setAgentPresence);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Не удалось подключиться к звонку");
      });

    return () => {
      cancelled = true;
      liveKitRef.current = null;
      unsubscribeChannel();
      unsubscribePresence?.();
      channel.close();
      liveKit.disconnect();
    };
    // initialSpeakerId применяется только при первом подключении — дальше устройство
    // меняется через DeviceSettings (switchDevice), не пересозданием соединения.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, stream]);

  const questionText =
    channelState.status === "question_active" || channelState.status === "completed"
      ? channelState.event.text
      : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
        <div className="flex min-h-[220px] flex-col justify-center gap-4 rounded-xl border bg-card p-6">
          <p className="text-xl font-medium leading-snug">{questionText ?? "Подключаемся к интервью…"}</p>
          <StatusLine channelState={channelState} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="space-y-3">
          <div
            className={`relative aspect-video overflow-hidden rounded-xl border-4 bg-muted/30 transition-colors duration-150 ${
              candidateSpeaking ? "border-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.25)]" : "border-transparent"
            }`}
          >
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            <div
              className={`absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white transition-opacity ${
                candidateSpeaking ? "bg-primary opacity-100" : "opacity-0"
              }`}
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              Вы говорите
            </div>
          </div>
          <div
            className={`flex aspect-video items-center justify-center rounded-xl border text-sm ${
              agentPresence === "speaking" ? "border-primary bg-primary/10 text-primary" : "bg-muted/30 text-muted-foreground"
            }`}
          >
            {agentPresence === "speaking" ? "Интервьюер говорит…" : agentPresence === "present" ? "Интервьюер" : "Ожидаем интервьюера…"}
          </div>
          <DeviceSettings liveKitRef={liveKitRef} />
        </div>
      </div>
    </div>
  );
}

function StatusLine({ channelState }: { channelState: ChannelState }) {
  switch (channelState.status) {
    case "connecting":
      return <p className="text-sm text-muted-foreground">Подключаемся…</p>;
    case "reconnecting":
      return <p className="text-sm text-destructive">Потеряна связь — переподключаемся…</p>;
    case "completed":
      return <p className="text-sm text-muted-foreground">Интервью завершено. Спасибо, ответы отправлены на обработку.</p>;
    case "closed":
      return <p className="text-sm text-muted-foreground">Соединение закрыто.</p>;
    case "question_active":
      return <p className="text-sm text-muted-foreground">Слушаем вас — говорите свободно.</p>;
  }
}

const CAN_SELECT_OUTPUT_DEVICE =
  typeof window !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

/** Переключение камеры/микрофона/динамика прямо во время звонка — как в Zoom/Meet, не
 * только на экране подготовки. Список устройств — тот же `enumerateDevices`, доступ уже
 * выдан (`DeviceCheck`), лейблы у устройств не пустые. */
function DeviceSettings({ liveKitRef }: { liveKitRef: React.RefObject<LiveKitSession | null> }) {
  const [open, setOpen] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setCameras(devices.filter((d) => d.kind === "videoinput"));
      setMicrophones(devices.filter((d) => d.kind === "audioinput"));
      setSpeakers(devices.filter((d) => d.kind === "audiooutput"));
    });
  }, [open]);

  const switchDevice = (kind: MediaDeviceKind, deviceId: string) => {
    void liveKitRef.current?.switchDevice(kind, deviceId);
  };

  return (
    <div className="rounded-xl border bg-card p-3 text-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-muted-foreground"
      >
        <span>Настройки устройств</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <label className="block space-y-1">
            <span className="text-muted-foreground">Камера</span>
            <select
              className="w-full rounded-md border bg-background px-2 py-1.5"
              onChange={(event) => switchDevice("videoinput", event.target.value)}
            >
              {cameras.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label || "Камера"}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground">Микрофон</span>
            <select
              className="w-full rounded-md border bg-background px-2 py-1.5"
              onChange={(event) => switchDevice("audioinput", event.target.value)}
            >
              {microphones.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label || "Микрофон"}
                </option>
              ))}
            </select>
          </label>
          {CAN_SELECT_OUTPUT_DEVICE && (
            <label className="block space-y-1">
              <span className="text-muted-foreground">Динамики</span>
              <select
                className="w-full rounded-md border bg-background px-2 py-1.5"
                onChange={(event) => switchDevice("audiooutput", event.target.value)}
              >
                {speakers.map((speaker) => (
                  <option key={speaker.deviceId} value={speaker.deviceId}>
                    {speaker.label || "Динамики"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** Индикация речи кандидата — прямой анализ уровня микрофона через Web Audio
 * AnalyserNode (тот же приём, что и в DeviceCheck.tsx, там подтверждённо работает),
 * а не LiveKit `room.activeSpeakers` — тот теоретически тоже должен срабатывать, но
 * не проверен вживую как надёжный источник для этой цели, а порог/задержка SFU-стороны
 * не под нашим контролем. Простой RMS по последнему буферу, порог — эмпирический. */
function useMicSpeaking(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setSpeaking(false);
      return;
    }
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let rafId: number;
    const SPEAKING_THRESHOLD = 0.06;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (const sample of data) {
        const normalized = (sample - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      setSpeaking(rms > SPEAKING_THRESHOLD);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      audioContext.close().catch(() => {});
    };
  }, [stream]);

  return speaking;
}
