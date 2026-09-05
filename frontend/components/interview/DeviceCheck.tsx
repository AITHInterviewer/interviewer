"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";

export type DeviceCheckStatus = "idle" | "checking" | "granted" | "denied";

/** Число полос в реальном уровнемере (визуал `.wave-bars`, см. product.css) — высота
 * каждой берётся из настоящего `AnalyserNode.getByteFrequencyData`, не анимируется
 * декоративно. */
const BAR_COUNT = 12;

const MIC_AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
} as const;

type DeviceCheckProps = {
  /** Вызывается один раз, когда кандидат явно подтвердил выбор устройств кнопкой
   * «Начать интервью» — сигнал наверх, что можно переходить к интервью
   * (specs/004-candidate-interview-flow/spec.md, US1, Acceptance Scenario 2).
   * `speakerId` — выбранное устройство вывода (колонки/наушники), `null` если браузер
   * не поддерживает выбор (нет `HTMLMediaElement.setSinkId`, например Safari) или
   * устройство одно. */
  onGranted: (stream: MediaStream, speakerId: string | null) => void;
};

const CAN_SELECT_OUTPUT_DEVICE =
  typeof window !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

function micErrorMessage(cause: unknown): string | null {
  const name = cause instanceof DOMException ? cause.name : "";
  if (name === "NotFoundError") {
    return "Микрофон не найден на этом устройстве.";
  }
  if (name === "NotReadableError") {
    return "Микрофон уже используется другим приложением.";
  }
  if (name === "NotAllowedError") {
    return null;
  }
  return cause instanceof Error ? cause.message : "Неизвестная ошибка.";
}

function cameraHint(cause: unknown): string {
  const name = cause instanceof DOMException ? cause.name : "";
  if (name === "NotFoundError") {
    return "Камера не найдена. Интервью можно пройти без неё.";
  }
  if (name === "NotReadableError") {
    return "Камера занята другим приложением. Интервью можно пройти без неё.";
  }
  if (name === "NotAllowedError") {
    return "Камера не включена. Интервью можно пройти без неё.";
  }
  return "Камеру включить не получилось. Интервью можно пройти без неё.";
}

/**
 * Проверка микрофона (обязательно) и камеры (по желанию). На том же экране, что и
 * согласие (см. `InterviewFlow.tsx`), не отдельный шаг: доступ запрашивается только
 * по явному клику (FR-001). Микрофон — отдельный `getUserMedia({ audio })`, камера —
 * отдельный `getUserMedia({ video })`; отказ камеры не блокирует интервью.
 */
export function DeviceCheck({ onGranted }: DeviceCheckProps) {
  const [status, setStatus] = useState<DeviceCheckStatus>("idle");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraNote, setCameraNote] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [barLevels, setBarLevels] = useState<number[]>(() => Array(BAR_COUNT).fill(0));
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [microphoneId, setMicrophoneId] = useState<string>("");
  const [speakerId, setSpeakerId] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopMicLevelLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }, []);

  const startMicLevelLoop = useCallback(
    (stream: MediaStream) => {
      stopMicLevelLoop();
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
      // Отдельный буфер для реального спектра — рисует `.wave-bars` тем же анализатором,
      // что и RMS-уровень выше, вместо декоративной фейковой анимации.
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
    },
    [stopMicLevelLoop],
  );

  /** Список устройств доступен (с человекочитаемыми названиями) только после выдачи
   * разрешения — до этого label у всех пустой. Вызывается после успешного acquire(). */
  const refreshDeviceList = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setCameras(devices.filter((d) => d.kind === "videoinput"));
    setMicrophones(devices.filter((d) => d.kind === "audioinput"));
    if (CAN_SELECT_OUTPUT_DEVICE) {
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      setSpeakers(outputs);
      setSpeakerId((current) => current || outputs[0]?.deviceId || "");
    }
  }, []);

  const attachVideoTrack = useCallback((stream: MediaStream, videoTrack: MediaStreamTrack) => {
    for (const oldTrack of stream.getVideoTracks()) {
      stream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    stream.addTrack(videoTrack);
    setCameraId(videoTrack.getSettings().deviceId ?? "");
    setCameraOn(true);
    setCameraNote(null);
  }, []);

  const tryEnableCamera = useCallback(
    async (stream: MediaStream, announceFailure: boolean) => {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          attachVideoTrack(stream, videoTrack);
        }
        for (const extra of videoStream.getAudioTracks()) {
          extra.stop();
        }
      } catch (cause) {
        setCameraOn(stream.getVideoTracks().length > 0);
        if (announceFailure) {
          setCameraNote(cameraHint(cause));
        }
      }
    },
    [attachVideoTrack],
  );

  /** Запрос микрофона — только по явному клику, не при монтировании. Камера
   * запрашивается отдельно следом; её отказ не переводит экран в denied. */
  const acquireMic = useCallback(async () => {
    setStatus("checking");
    setErrorReason(null);
    setCameraNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: MIC_AUDIO_CONSTRAINTS,
      });
      const previous = streamRef.current;
      if (previous && previous !== stream) {
        previous.getTracks().forEach((track) => track.stop());
      }
      streamRef.current = stream;
      startMicLevelLoop(stream);
      setMicrophoneId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? "");
      setCameraOn(false);
      await tryEnableCamera(stream, false);
      setStatus("granted");
      await refreshDeviceList();
    } catch (cause) {
      setErrorReason(micErrorMessage(cause));
      setStatus("denied");
    }
  }, [refreshDeviceList, startMicLevelLoop, tryEnableCamera]);

  const acquireCamera = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    setCameraNote(null);
    await tryEnableCamera(stream, true);
    await refreshDeviceList();
  }, [refreshDeviceList, tryEnableCamera]);

  /** Переключение на конкретно выбранную камеру/микрофон — заменяет трек нужного вида
   * прямо в существующем `MediaStream` (не создаёт новый объект), чтобы ссылка на поток
   * оставалась стабильной для остального дерева компонентов. */
  const switchDevice = useCallback(
    async (kind: "video" | "audio", deviceId: string) => {
      const stream = streamRef.current;
      if (!stream) return;
      const constraints: MediaStreamConstraints =
        kind === "video"
          ? { video: { deviceId: { exact: deviceId } } }
          : { audio: { deviceId: { exact: deviceId }, ...MIC_AUDIO_CONSTRAINTS } };
      const replacement = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = kind === "video" ? replacement.getVideoTracks()[0] : replacement.getAudioTracks()[0];
      if (!newTrack) return;
      const oldTracks = kind === "video" ? stream.getVideoTracks() : stream.getAudioTracks();
      for (const oldTrack of oldTracks) {
        stream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      stream.addTrack(newTrack);

      if (kind === "video" && videoRef.current) {
        // Переприсваиваем srcObject — иначе некоторые браузеры не подхватывают
        // добавленный/удалённый трек в уже отрендеренном <video>.
        videoRef.current.srcObject = stream;
      }
      if (kind === "audio") {
        startMicLevelLoop(stream);
      }
      if (kind === "video") setCameraId(deviceId);
      else setMicrophoneId(deviceId);
    },
    [startMicLevelLoop],
  );

  const handedOffRef = useRef(false);

  const confirm = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || stream.getAudioTracks().length === 0) return;
    // Стрим уходит в интервью дальше жить — размонтирование этого компонента (которое
    // сейчас и произойдёт) не должно останавливать его треки, иначе камера/микрофон
    // гаснут прямо в момент перехода (индикатор записи браузера пропадает, агент не
    // получает аудио).
    handedOffRef.current = true;
    onGranted(stream, CAN_SELECT_OUTPUT_DEVICE ? speakerId || null : null);
  }, [onGranted, speakerId]);

  useEffect(() => {
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!video || !stream || !cameraOn) return;
    video.srcObject = stream;
  }, [cameraOn, status]);

  useEffect(
    () => () => {
      stopMicLevelLoop();
      if (!handedOffRef.current) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
      }
    },
    [stopMicLevelLoop],
  );

  if (status === "idle") {
    return (
      <ScreenState
        kind="empty"
        title="Нужен доступ к микрофону"
        text="Для голосовых ответов нужен микрофон. Камера не обязательна — интервью можно пройти без неё."
        action={
          <Button type="button" onClick={() => void acquireMic()}>
            Разрешить микрофон
          </Button>
        }
      />
    );
  }

  if (status === "denied") {
    return (
      <ScreenState
        kind="error"
        title="Нет доступа к микрофону"
        text={
          errorReason ??
          "Похоже, доступ к микрофону уже был отклонён раньше — из кода браузер больше не показывает системный " +
            "запрос повторно. Разрешите микрофон для этого сайта в настройках браузера " +
            "(обычно значок замка слева от адресной строки) и нажмите «Запросить микрофон снова»."
        }
        action={
          <Button type="button" onClick={() => void acquireMic()}>
            Запросить микрофон снова
          </Button>
        }
      />
    );
  }

  const readyLabel =
    status === "checking"
      ? "Запрашиваем доступ к микрофону…"
      : cameraOn
        ? "Микрофон и камера готовы"
        : "Микрофон готов. Камера выключена — это нормально.";

  return (
    <div className="space-y-4">
      {cameraOn ? (
        <div className="aspect-video w-full overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-muted)]">
          {/* Превью собственной камеры кандидата — без субтитров: контент не несёт информации для восприятия. */}
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        </div>
      ) : status === "granted" ? (
        <div className="camera-mini">
          <span>Камера не обязательна. Интервью можно пройти без неё.</span>
          <Button type="button" variant="secondary" onClick={() => void acquireCamera()}>
            Включить камеру
          </Button>
        </div>
      ) : null}

      {cameraNote ? <p className="field__error">{cameraNote}</p> : null}

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
        <span className="text-[13px] text-[var(--ink-secondary)]">{readyLabel}</span>
      </div>

      {status === "granted" && (cameras.length > 1 || microphones.length > 1) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {cameraOn && cameras.length > 1 && (
            <label className="field-block">
              <span className="text-[12px] text-[var(--ink-secondary)]">Камера</span>
              <select
                className="min-h-[42px] w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--ink)]"
                value={cameraId}
                onChange={(event) => void switchDevice("video", event.target.value)}
              >
                {cameras.map((camera) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label || "Камера"}
                  </option>
                ))}
              </select>
            </label>
          )}
          {microphones.length > 1 && (
            <label className="field-block">
              <span className="text-[12px] text-[var(--ink-secondary)]">Микрофон</span>
              <select
                className="min-h-[42px] w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--ink)]"
                value={microphoneId}
                onChange={(event) => void switchDevice("audio", event.target.value)}
              >
                {microphones.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || "Микрофон"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {status === "granted" && (
        <Button type="button" onClick={confirm}>
          Начать интервью
        </Button>
      )}
    </div>
  );
}
