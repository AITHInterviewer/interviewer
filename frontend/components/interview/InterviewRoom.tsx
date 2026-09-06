"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronLeft, ChevronRight, Check, Camera, Mic, Volume2, MoreVertical } from "lucide-react";

import { apiFetch, resolveLiveKitWsUrl } from "@/lib/api";
import { ControlChannel, type ChannelState, type SubtitleLine } from "@/lib/control-channel";
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
  initialQuestionText,
}: {
  sessionId: string;
  stream: MediaStream | null;
  initialSpeakerId?: string | null;
  // Персистентный на бэке текст текущего ОСНОВНОГО вопроса (см.
  // Interview.current_question_text) — переживает reconnect/перезагрузку страницы, пока
  // не придёт первый ControlEvent.type==="question" по WS.
  initialQuestionText?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const liveKitRef = useRef<LiveKitSession | null>(null);
  const channelRef = useRef<ControlChannel | null>(null);
  const [channelState, setChannelState] = useState<ChannelState>({ status: "connecting" });
  const [agentPresence, setAgentPresence] = useState<AgentPresence>("absent");
  // Неустранимая ошибка звонка (например, LiveKit не смог установить signal-соединение
  // за отведённое время) — дальше ждать нечего, показываем экран выхода вместо того,
  // чтобы кандидат смотрел на мёртвую комнату с текстом ошибки под вопросом.
  const [fatalError, setFatalError] = useState<string | null>(null);
  // После switchDevice LiveKit пересоздаёт трек. Превью и индикатор речи читают
  // эти значения из state, а не из ref во время рендера.
  const [activeVideoTrack, setActiveVideoTrack] = useState<MediaStreamTrack | null>(
    () => stream?.getVideoTracks()[0] ?? null,
  );
  const [activeAudioTrack, setActiveAudioTrack] = useState<MediaStreamTrack | null>(
    () => stream?.getAudioTracks()[0] ?? null,
  );

  const syncActiveTracks = (session: LiveKitSession | null) => {
    setActiveVideoTrack(session?.getLocalVideoTrack() ?? stream?.getVideoTracks()[0] ?? null);
    setActiveAudioTrack(session?.getLocalAudioTrack() ?? stream?.getAudioTracks()[0] ?? null);
  };
  const candidateSpeaking = useMicSpeaking(activeAudioTrack);
  // Роадмап считает только "оригинальные" вопросы (ControlEvent.type === "question") —
  // checkin/adaptive_question не несут question_index/questions_total (см.
  // control-channel.ts) и намеренно не двигают роадмап: это уточнения в рамках текущего
  // вопроса, не отдельный шаг. Держим последний известный index/total отдельно от
  // channelState, потому что тот может в любой момент стать checkin-событием.
  const [roadmap, setRoadmap] = useState<{ index: number; total: number } | null>(null);
  // Реальный найденный баг (2026-09-06): текст вопроса брался из ПОСЛЕДНЕГО ControlEvent
  // без разбора типа — checkin/adaptive_question (доп./наводящий вопрос от LLM) тем же
  // полем стирал основной вопрос, кандидат его больше не видел, решил, что агент завис.
  // baseQuestionText обновляется ТОЛЬКО на type==="question", тем же паттерном "adjusting
  // state during render", что и roadmap чуть выше; доп./наводящий вопрос — отдельно, ниже,
  // не заменяет основной.
  const [baseQuestionText, setBaseQuestionText] = useState<string | null>(initialQuestionText ?? null);
  const [lastBaseQuestionEvent, setLastBaseQuestionEvent] = useState<unknown>(null);
  // Таймер отведённого на вопрос времени (US: «таймер отведённого времени на вопрос»).
  // Дедлайн — абсолютный момент времени, выставляется при получении ControlEvent.type==="question"
  // из его time_limit_sec; сам обратный отсчёт тикает от `now`. Это только индикатор для
  // кандидата — реально ждёт/подбадривает/переходит по нему live-agent, не фронт.
  const [questionTimer, setQuestionTimer] = useState<{ startMs: number; limitSec: number } | null>(null);
  const [now, setNow] = useState(0);
  const [nextSent, setNextSent] = useState(false);
  // Субтитры: последняя реплика кандидата и последняя реплика интервьюера. Выключаются
  // кнопкой снизу слева, выбор запоминается в localStorage.
  const [subtitles, setSubtitles] = useState<{ candidate: string | null; agent: string | null }>({
    candidate: null,
    agent: null,
  });
  const [subtitlesOn, setSubtitlesOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem("interview-subtitles") !== "off";
    } catch {
      return true; // приватный режим и т.п. — дефолт «включено»
    }
  });

  useEffect(() => {
    if (questionTimer == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [questionTimer]);

  const toggleSubtitles = () => {
    setSubtitlesOn((on) => {
      const next = !on;
      try {
        localStorage.setItem("interview-subtitles", next ? "on" : "off");
      } catch {
        /* игнорируем — тумблер всё равно сработает на эту сессию */
      }
      return next;
    });
  };

  // now === 0 до первого тика интервала — таймер ещё не показываем, чтобы не мигнуть «0:00».
  const remainingMs =
    questionTimer && now > 0
      ? Math.max(0, questionTimer.startMs + questionTimer.limitSec * 1000 - now)
      : null;
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
  if (
    (channelState.status === "question_active" || channelState.status === "completed") &&
    channelState.event.type === "question" &&
    channelState.event !== lastBaseQuestionEvent
  ) {
    setLastBaseQuestionEvent(channelState.event);
    setBaseQuestionText(channelState.event.text);
    const limit = channelState.event.time_limit_sec;
    const startMs = Date.parse(channelState.event.ts);
    setQuestionTimer(limit && Number.isFinite(startMs) ? { startMs, limitSec: limit } : null);
    setNextSent(false);
  }
  // Доп./наводящий вопрос от LLM — не персистентный, не двигает baseQuestionText, просто
  // текущее значение канала, пока оно активно.
  const followUpText =
    channelState.status === "question_active" &&
    (channelState.event.type === "checkin" || channelState.event.type === "adaptive_question")
      ? channelState.event.text
      : null;

  useEffect(() => {
    if (videoRef.current && activeVideoTrack) {
      videoRef.current.srcObject = new MediaStream([activeVideoTrack]);
    }
  }, [activeVideoTrack]);

  useEffect(() => {
    if (!stream) return;
    let cancelled = false;
    const channel = new ControlChannel(sessionId);
    channelRef.current = channel;
    const liveKit = new LiveKitSession();
    liveKitRef.current = liveKit;
    let unsubscribePresence: (() => void) | null = null;

    const unsubscribeChannel = channel.subscribe(setChannelState);
    const unsubscribeSubtitles = channel.subscribeSubtitles((line: SubtitleLine) => {
      setSubtitles((current) => ({ ...current, [line.speaker]: line.text }));
    });
    channel.connect();

    // Блок безопасности на карточке кандидата (см. control-channel.ts) — переключение
    // вкладки видно из document.visibilitychange, отключение камеры — из mute/unmute
    // на самом видеотреке (не через LiveKit API: кандидат ничего не выключает сам в этом
    // UI, это сигнал устройства/ОС — закрыл крышку, забрал разрешение и т.п.).
    const handleVisibility = () => {
      channel.sendSecuritySignal(document.hidden ? "tab_hidden" : "tab_visible");
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const videoTrack = stream.getVideoTracks()[0];
    const handleTrackMute = () => channel.sendSecuritySignal("camera_muted");
    const handleTrackUnmute = () => channel.sendSecuritySignal("camera_unmuted");
    videoTrack?.addEventListener("mute", handleTrackMute);
    videoTrack?.addEventListener("unmute", handleTrackUnmute);

    apiFetch<LiveKitTokenResponse>(`/api/interview/${sessionId}/livekit-token`, { method: "POST" })
      .then((tokenResponse) => {
        if (cancelled) return undefined;
        return liveKit.connect(resolveLiveKitWsUrl(tokenResponse.ws_url), tokenResponse.token, stream, initialSpeakerId);
      })
      .then(() => {
        if (cancelled) return;
        unsubscribePresence = liveKit.onAgentPresenceChange(setAgentPresence);
        syncActiveTracks(liveKit);
      })
      .catch((cause) => {
        if (cancelled) return;
        setFatalError(cause instanceof Error ? cause.message : "Не удалось подключиться к звонку");
        // Дальше ждать нечего — останавливаем оба канала, не дожидаясь размонтирования.
        channel.close();
        liveKit.disconnect();
      });

    return () => {
      cancelled = true;
      liveKitRef.current = null;
      channelRef.current = null;
      unsubscribeChannel();
      unsubscribeSubtitles();
      unsubscribePresence?.();
      document.removeEventListener("visibilitychange", handleVisibility);
      videoTrack?.removeEventListener("mute", handleTrackMute);
      videoTrack?.removeEventListener("unmute", handleTrackUnmute);
      channel.close();
      liveKit.disconnect();
    };
    // initialSpeakerId применяется только при первом подключении — дальше устройство
    // меняется через DeviceSettings (switchDevice), не пересозданием соединения.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, stream]);

  const hasCamera = Boolean(activeVideoTrack);

  if (channelState.status === "completed") {
    return (
      <section className="setup-stage">
        <Check size={32} className="text-[var(--positive)]" />
        <h1>Интервью завершено</h1>
        <p>
          Спасибо, ваши ответы записаны и сейчас обрабатываются. Итоги и обратную связь по
          результатам передаст рекрутёр вакансии — свяжитесь с ним позже.
        </p>
      </section>
    );
  }

  if (fatalError) {
    return (
      <section className="setup-stage">
        <h1>Интервью прервано</h1>
        <p>Причина: {fatalError}</p>
        <p>
          Попробуйте открыть эту же ссылку ещё раз. Если не получится — часть ответов уже записана,
          рекрутёр вакансии свяжется с вами по итогам.
        </p>
      </section>
    );
  }

  return (
    <div className="relative">
      {/* Ячейка вопроса — тот же .setup-stage, что и на экране "Устройства" (тот же размер
          и вид карточки). Камера кандидата и плашка интервьюера здесь не участвуют в этой
          ширине вовсе — на десктопе они прижаты прямо к правому краю страницы. */}
      <section className="setup-stage flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-2xl font-medium leading-snug">
          {baseQuestionText ?? "Подключаемся к интервью…"}
        </p>
        {followUpText ? <p className="question-followup">{followUpText}</p> : null}
        <StatusLine channelState={channelState} />
      </section>

      {/* Субтитры (зеркало произнесённого — выключаются кнопкой снизу слева) и под ними
          таймер отведённого на вопрос времени — единой колонкой над нижними кнопками. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-16 z-20 mx-auto flex max-w-2xl flex-col items-center gap-1 px-4 text-center">
        {subtitlesOn && subtitles.agent ? (
          <p className="rounded-md bg-[color-mix(in_srgb,var(--surface-raised)_92%,transparent)] px-3 py-1 text-sm text-[var(--ink-secondary)] shadow-sm">
            Интервьюер: {subtitles.agent}
          </p>
        ) : null}
        {subtitlesOn && subtitles.candidate ? (
          <p className="rounded-md bg-[color-mix(in_srgb,var(--surface-raised)_92%,transparent)] px-3 py-1 text-sm shadow-sm">
            Вы: {subtitles.candidate}
          </p>
        ) : null}
        {remainingMs != null ? (
          <p className="text-sm tabular-nums text-[var(--ink-tertiary)]">
            {remainingMs > 0 ? `Осталось времени на вопрос: ${formatDuration(remainingMs)}` : "Время на вопрос вышло"}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={toggleSubtitles}
        aria-pressed={subtitlesOn}
        className="fixed bottom-6 left-6 z-30 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-2 text-sm text-[var(--ink-secondary)] hover:bg-[var(--surface)]"
      >
        Субтитры: {subtitlesOn ? "вкл" : "выкл"}
      </button>

      {channelState.status === "question_active" ? (
        <button
          type="button"
          onClick={() => {
            channelRef.current?.sendNextQuestion();
            setNextSent(true);
          }}
          disabled={nextSent}
          className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {nextSent ? "Переходим…" : "Дальше"}
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}

      {roadmap && (
        <ol className="hidden sm:fixed sm:left-6 sm:top-1/2 sm:block sm:w-[180px] sm:-translate-y-1/2 sm:space-y-2.5 sm:text-sm">
          {Array.from({ length: roadmap.total }, (_, i) => {
            const done = i < roadmap.index;
            const active = i === roadmap.index;
            return (
              <li
                key={i}
                className={`flex items-center gap-2 ${
                  active
                    ? "font-semibold text-[var(--accent)]"
                    : done
                      ? "text-[var(--positive)]"
                      : "text-[var(--ink-tertiary)]"
                }`}
              >
                {done ? (
                  <Check size={14} className="shrink-0" />
                ) : (
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: active ? "var(--accent)" : "var(--ink-tertiary)" }}
                  />
                )}
                Вопрос {i + 1}
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-6 space-y-3 sm:fixed sm:right-6 sm:top-1/2 sm:mt-0 sm:w-[220px] sm:-translate-y-1/2">
        {/* relative-обёртка снаружи overflow-hidden-плитки видео — иначе всплывающее
            меню DeviceSettings обрезается границами плитки (overflow-hidden), даже
            будучи абсолютно спозиционированным поверх неё. */}
        <div className="relative">
          <div
            className={`relative aspect-video overflow-hidden rounded-xl border-4 bg-[var(--surface-muted)] transition-colors duration-150 ${
              candidateSpeaking
                ? "border-[var(--accent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
                : "border-transparent"
            }`}
          >
            <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
            {!hasCamera ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--ink-secondary)]">
                Камера выключена
              </div>
            ) : null}
            <div
              className={`absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--accent-ink)] transition-opacity ${
                candidateSpeaking ? "opacity-100" : "opacity-0"
              }`}
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-ink)]" />
              Вы говорите
            </div>
          </div>
          <div className="absolute right-2 top-2">
            <DeviceSettings liveKitRef={liveKitRef} onDeviceSwitched={() => syncActiveTracks(liveKitRef.current)} />
          </div>
        </div>
        <div
          className={`flex aspect-video items-center justify-center rounded-xl border-4 text-sm transition-colors duration-150 ${
            agentPresence === "speaking"
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)] shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_25%,transparent)]"
              : "border-transparent bg-[var(--surface-muted)] text-[var(--ink-secondary)]"
          }`}
        >
          {agentPresence === "speaking" ? "Интервьюер говорит…" : agentPresence === "present" ? "Интервьюер" : "Ожидаем интервьюера…"}
        </div>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function StatusLine({ channelState }: { channelState: ChannelState }) {
  switch (channelState.status) {
    case "connecting":
      return <p className="text-sm text-[var(--ink-secondary)]">Подключаемся…</p>;
    case "reconnecting":
      return <p className="text-sm text-[var(--danger)]">Потеряна связь — переподключаемся…</p>;
    case "completed":
      // Недостижимо: InterviewRoom рендерит экран завершения раньше StatusLine (см. выше).
      return null;
    case "closed":
      return <p className="text-sm text-[var(--ink-secondary)]">Соединение закрыто.</p>;
    case "question_active":
      return <p className="text-sm text-[var(--ink-secondary)]">Слушаем вас — говорите свободно.</p>;
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
function DeviceSettings({
  liveKitRef,
  onDeviceSwitched,
}: {
  liveKitRef: React.RefObject<LiveKitSession | null>;
  /** Камера/микрофон реально переключились в комнате — вызывающая сторона должна
   * перечитать активный трек (превью, индикатор речи). Для динамиков не значим. */
  onDeviceSwitched?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>("main");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [selected, setSelected] = useState<Partial<Record<MediaDeviceKind, string>>>({});
  const [switchError, setSwitchError] = useState<string | null>(null);
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

  const switchDevice = async (kind: MediaDeviceKind, deviceId: string) => {
    setSwitchError(null);
    setView("main");
    try {
      await liveKitRef.current?.switchDevice(kind, deviceId);
      setSelected((current) => ({ ...current, [kind]: deviceId }));
      if (kind !== "audiooutput") onDeviceSwitched?.();
    } catch {
      setSwitchError("Не удалось переключить устройство. Попробуйте ещё раз.");
    }
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
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--ink-secondary)] hover:bg-[var(--surface)]"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-10 w-72 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] text-sm shadow-lg">
          {switchError && (
            <p className="border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--danger)]">{switchError}</p>
          )}
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
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface)] ${
                      index > 0 ? "border-t border-[var(--border)]" : ""
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[var(--ink-secondary)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[var(--ink-secondary)]">{row.label}</span>
                      <span className="block truncate">{current?.label || "По умолчанию"}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ink-secondary)]" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-1">
              <button
                type="button"
                onClick={() => setView("main")}
                className="flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-3 text-left font-medium hover:bg-[var(--surface)]"
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
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--surface)]"
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
function useMicSpeaking(track: MediaStreamTrack | null): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!track) {
      return;
    }
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    const source = audioContext.createMediaStreamSource(new MediaStream([track]));
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
  }, [track]);

  return speaking;
}
