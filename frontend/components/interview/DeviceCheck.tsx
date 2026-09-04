"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export type DeviceCheckStatus = "idle" | "checking" | "granted" | "denied";

type DeviceCheckProps = {
  /** Вызывается один раз, когда кандидат явно подтвердил выбор устройств кнопкой
   * «Начать интервью» — сигнал наверх, что можно переходить к интервью
   * (specs/004-candidate-interview-flow/spec.md, US1, Acceptance Scenario 2). */
  onGranted: (stream: MediaStream) => void;
};

/**
 * Проверка камеры/микрофона (FR-002/FR-013) — на том же экране, что и согласие
 * (см. `InterviewFlow.tsx`), не отдельный шаг: запрашивает доступ только по явному
 * клику «Разрешить доступ» (FR-001 — camera/mic не запрашиваются до подтверждения
 * согласия), показывает превью видео + индикатор уровня микрофона через Web Audio
 * AnalyserNode + выбор конкретного устройства (если их несколько). При отказе — вместо
 * повторного авто-запроса (браузер после явного Block больше не показывает системный
 * диалог из JS вообще) объясняет, что доступ нужно вернуть в настройках сайта в самом
 * браузере — «Запросить снова» пробует, но чаще всего сработает только после этого.
 */
export function DeviceCheck({ onGranted }: DeviceCheckProps) {
  const [status, setStatus] = useState<DeviceCheckStatus>("idle");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [microphoneId, setMicrophoneId] = useState<string>("");
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
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (const sample of data) {
          const normalized = (sample - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        setMicLevel(Math.min(1, rms * 4));
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
  }, []);

  /** Собственно запрос доступа — только по явному вызову (клик), не при монтировании. */
  const acquire = useCallback(async () => {
    setStatus("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      startMicLevelLoop(stream);
      setCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? "");
      setMicrophoneId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? "");
      setStatus("granted");
      await refreshDeviceList();
    } catch (cause) {
      // Разрешение на сайт в браузере может быть выдано (зелёные тумблеры в настройках
      // сайта), а getUserMedia всё равно упадёт — например, если у устройства физически
      // нет камеры/микрофона (NotFoundError, частый случай для RDP-сессии без проброса
      // видео) или устройство занято другим приложением (NotReadableError). Показываем
      // реальную причину вместо одного общего "нет доступа" на все случаи.
      const name = cause instanceof DOMException ? cause.name : "";
      setErrorReason(
        name === "NotFoundError"
          ? "Камера или микрофон не найдены на этом устройстве."
          : name === "NotReadableError"
            ? "Камера или микрофон уже используются другим приложением."
            : name === "NotAllowedError"
              ? null // штатный кейс ниже — про разрешение браузера
              : cause instanceof Error
                ? cause.message
                : "Неизвестная ошибка.",
      );
      setStatus("denied");
    }
  }, [refreshDeviceList, startMicLevelLoop]);

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
          : { audio: { deviceId: { exact: deviceId }, echoCancellation: true } };
      const replacement = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = kind === "video" ? replacement.getVideoTracks()[0] : replacement.getAudioTracks()[0];
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

  const confirm = useCallback(() => {
    if (streamRef.current) onGranted(streamRef.current);
  }, [onGranted]);

  useEffect(
    () => () => {
      stopMicLevelLoop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [stopMicLevelLoop],
  );

  if (status === "idle") {
    return (
      <div className="space-y-3 rounded-xl border bg-muted/30 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Понадобится доступ к камере и микрофону — без него интервью пройти нельзя.
        </p>
        <Button type="button" onClick={() => void acquire()}>
          Разрешить доступ к камере и микрофону
        </Button>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div
        role="alert"
        className="space-y-4 rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center"
      >
        <h2 className="text-lg font-medium">Нет доступа к камере или микрофону</h2>
        <p className="text-sm text-muted-foreground">
          {errorReason ??
            "Похоже, доступ уже был отклонён раньше — из кода браузер больше не показывает системный " +
              "запрос повторно. Разрешите камеру и микрофон для этого сайта в настройках браузера " +
              "(обычно значок замка/камеры слева от адресной строки) и нажмите «Запросить снова»."}
        </p>
        <Button type="button" onClick={() => void acquire()}>
          Запросить доступ снова
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="aspect-video overflow-hidden rounded-xl border bg-muted/30">
        {/* Превью собственной камеры кандидата — без субтитров: контент не несёт информации для восприятия. */}
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
      </div>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {status === "checking" ? "Запрашиваем доступ к камере и микрофону…" : "Камера и микрофон готовы"}
        </p>
        <div
          role="meter"
          aria-label="Уровень микрофона"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(micLevel * 100)}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full bg-primary transition-[width] duration-75"
            style={{ width: `${Math.round(micLevel * 100)}%` }}
          />
        </div>
      </div>

      {status === "granted" && (cameras.length > 1 || microphones.length > 1) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {cameras.length > 1 && (
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Камера</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
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
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Микрофон</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
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
