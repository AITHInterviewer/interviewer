"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronLeft, ChevronRight, Check, Camera, Mic, Volume2, MoreVertical } from "lucide-react";

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
  // Роадмап считает только "оригинальные" вопросы (ControlEvent.type === "question") —
  // checkin/adaptive_question не несут question_index/questions_total (см.
  // control-channel.ts) и намеренно не двигают роадмап: это уточнения в рамках текущего
  // вопроса, не отдельный шаг. Держим последний известный index/total отдельно от
  // channelState, потому что тот может в любой момент стать checkin-событием.
  const [roadmap, setRoadmap] = useState<{ index: number; total: number } | null>(null);
  // Не useEffect, а "adjusting state during render" (react.dev/learn/you-might-not-need-an-effect,
  // «Storing information from previous renders») — refs недоступны во время рендера
  // (react-hooks/refs), поэтому "предыдущее" значение хранится тоже в state.
  const [lastRoadmapEvent, setLastRoadmapEvent] = useState<unknown>(null);
  if (
    (channelState.status === "question_active" || channelState.status === "completed") &&
    channelState.event !== lastRoadmapEvent
  ) {
    setLastRoadmapEvent(channelState.event);
    const { event } = channelState;
    if (event.type === "question" && event.question_index != null && event.questions_total != null) {
      setRoadmap({ index: event.question_index, total: event.questions_total });
    }
  }

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
      {roadmap && <Roadmap index={roadmap.index} total={roadmap.total} />}

      {/* 260px справа — камера кандидата + плашка интервьюера, симметричный пустой
          спейсер слева той же ширины, чтобы центральная колонка с вопросом была
          визуально центрирована в viewport, а не просто занимала оставшийся `1fr`. */}
      <div className="grid gap-4 sm:grid-cols-[260px_1fr_260px]">
        <div className="hidden sm:block" aria-hidden="true" />

        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-xl border bg-card p-6 text-center">
          <p className="text-xl font-medium leading-snug">{questionText ?? "Подключаемся к интервью…"}</p>
          <StatusLine channelState={channelState} />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="space-y-3">
          {/* relative-обёртка снаружи overflow-hidden-плитки видео — иначе всплывающее
              меню DeviceSettings обрезается границами плитки (overflow-hidden), даже
              будучи абсолютно спозиционированным поверх неё. */}
          <div className="relative">
            <div
              className={`aspect-video overflow-hidden rounded-xl border-4 bg-muted/30 transition-colors duration-150 ${
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
            <div className="absolute right-2 top-2">
              <DeviceSettings liveKitRef={liveKitRef} />
            </div>
          </div>
          <div
            className={`flex aspect-video items-center justify-center rounded-xl border text-sm ${
              agentPresence === "speaking" ? "border-primary bg-primary/10 text-primary" : "bg-muted/30 text-muted-foreground"
            }`}
          >
            {agentPresence === "speaking" ? "Интервьюер говорит…" : agentPresence === "present" ? "Интервьюер" : "Ожидаем интервьюера…"}
          </div>
        </div>
      </div>
    </div>
  );
}

/** US2 — прогресс по ОРИГИНАЛЬНЫМ вопросам, роадмапом сверху. Адаптивные/чек-ин вопросы
 * сюда намеренно не попадают (см. control-channel.ts) — только `total` кружков-шагов на
 * оригинальные вопросы вакансии, текущий выделен, пройденные помечены галочкой. */
function Roadmap({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const isDone = i < index;
        const isCurrent = i === index;
        return (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground"
                  : isDone
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-muted-foreground/30 text-muted-foreground"
              }`}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            {i < total - 1 && (
              <div className={`h-0.5 w-6 rounded-full sm:w-10 ${isDone ? "bg-primary/40" : "bg-muted-foreground/20"}`} />
            )}
          </div>
        );
      })}
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

type DeviceRow = { kind: MediaDeviceKind; icon: typeof Camera; label: string; devices: MediaDeviceInfo[] };
type MenuView = "main" | MediaDeviceKind;

/** Переключение камеры/микрофона/динамика прямо во время звонка — как в Zoom/Meet, не
 * только на экране подготовки. Список устройств — тот же `enumerateDevices`, доступ уже
 * выдан (`DeviceCheck`), лейблы у устройств не пустые. Меню — в стиле "..." попапа
 * Google Meet: карточка с рядами иконка+название+шеврон, клик по ряду открывает список
 * устройств этого вида (radio-стиль с галочкой у текущего), "назад" возвращает в главное
 * меню. */
function DeviceSettings({ liveKitRef }: { liveKitRef: React.RefObject<LiveKitSession | null> }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("main");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [selected, setSelected] = useState<Partial<Record<MediaDeviceKind, string>>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setCameras(devices.filter((d) => d.kind === "videoinput"));
      setMicrophones(devices.filter((d) => d.kind === "audioinput"));
      setSpeakers(devices.filter((d) => d.kind === "audiooutput"));
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
        setView("main");
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const switchDevice = (kind: MediaDeviceKind, deviceId: string) => {
    setSelected((current) => ({ ...current, [kind]: deviceId }));
    void liveKitRef.current?.switchDevice(kind, deviceId);
    setView("main");
  };

  const rows: DeviceRow[] = [
    { kind: "videoinput", icon: Camera, label: "Камера", devices: cameras },
    { kind: "audioinput", icon: Mic, label: "Микрофон", devices: microphones },
    ...(CAN_SELECT_OUTPUT_DEVICE
      ? [{ kind: "audiooutput" as const, icon: Volume2, label: "Динамики", devices: speakers }]
      : []),
  ];

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Настройки устройств"
        className="flex h-9 w-9 items-center justify-center rounded-full border bg-card text-muted-foreground hover:bg-muted"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-10 w-72 overflow-hidden rounded-xl border bg-popover text-sm shadow-lg">
          {view === "main" ? (
            <div className="py-1">
              {rows.map((row, index) => {
                const Icon = row.icon;
                const current = row.devices.find((d) => d.deviceId === selected[row.kind]) ?? row.devices[0];
                return (
                  <button
                    key={row.kind}
                    type="button"
                    onClick={() => setView(row.kind)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted ${
                      index > 0 ? "border-t" : ""
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-muted-foreground">{row.label}</span>
                      <span className="block truncate">{current?.label || "По умолчанию"}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-1">
              <button
                type="button"
                onClick={() => setView("main")}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left font-medium hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" />
                {rows.find((row) => row.kind === view)?.label}
              </button>
              {rows
                .find((row) => row.kind === view)
                ?.devices.map((device) => (
                  <button
                    key={device.deviceId}
                    type="button"
                    onClick={() => switchDevice(view as MediaDeviceKind, device.deviceId)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted"
                  >
                    <Check
                      className={`h-4 w-4 shrink-0 ${
                        (selected[view] ?? rows.find((row) => row.kind === view)?.devices[0]?.deviceId) ===
                        device.deviceId
                          ? "opacity-100"
                          : "opacity-0"
                      }`}
                    />
                    <span className="truncate">{device.label || "Устройство"}</span>
                  </button>
                ))}
            </div>
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
      setSpeaking(false);
    };
  }, [stream]);

  return speaking;
}
