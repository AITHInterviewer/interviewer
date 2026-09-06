"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";

export type DeviceCheckStatus = "idle" | "checking" | "granted" | "denied";

/** Число полос в реальном уровнемере (визуал `.wave-bars`, см. product.css) — высота
 * каждой берётся из настоящего `AnalyserNode.getByteFrequencyData`, не анимируется
 * декоративно. */
const BAR_COUNT = 12;

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

  /** Поток вешаем в момент монтирования `<video>`: `acquire()` отрабатывает ещё на
   * экране `checking`, элемента в DOM нет, `videoRef.current` = null — превью
   * оставалось серым квадратом. */
  const attachPreviewStream = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play()?.catch(() => {});
  }, []);

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

  /** Запрос доступа к камере/микрофону. Согласие на запись кандидат уже дал на
   * предыдущем экране (ConsentStage в InterviewFlow.tsx), поэтому здесь системный
   * диалог браузера запрашивается сразу при переходе на этот экран, без
   * промежуточного экрана-заглушки с кнопкой. */
  const acquire = useCallback(async () => {
    setStatus("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
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

  useEffect(() => {
    void acquire();
    // Запрашиваем один раз при монтировании экрана — acquire меняется только по
    // ссылкам на стабильные callbacks, повторный вызов эффекта не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          : { audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
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
        void videoRef.current.play()?.catch(() => {});
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
    if (!streamRef.current) return;
    // Стрим уходит в интервью дальше жить — размонтирование этого компонента (которое
    // сейчас и произойдёт) не должно останавливать его треки, иначе камера/микрофон
    // гаснут прямо в момент перехода (индикатор записи браузера пропадает, агент не
    // получает аудио).
    handedOffRef.current = true;
    onGranted(streamRef.current, CAN_SELECT_OUTPUT_DEVICE ? speakerId || null : null);
  }, [onGranted, speakerId]);

  useEffect(
    () => () => {
      stopMicLevelLoop();
      if (!handedOffRef.current) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
      }
    },
    [stopMicLevelLoop],
  );

  if (status === "idle" || status === "checking") {
    return <ScreenState kind="loading" title="Запрашиваем доступ к камере и микрофону…" text="Разрешите доступ в диалоге браузера." />;
  }

  if (status === "denied") {
    return (
      <ScreenState
        kind="error"
        title="Нет доступа к камере или микрофону"
        text={
          errorReason ??
          "Похоже, доступ уже был отклонён раньше — из кода браузер больше не показывает системный " +
            "запрос повторно. Разрешите камеру и микрофон для этого сайта в настройках браузера " +
            "(обычно значок замка/камеры слева от адресной строки) и нажмите «Запросить снова»."
        }
        action={
          <Button type="button" onClick={() => void acquire()}>
            Запросить доступ снова
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {/* Настоящая таблица 2×2 с общими границами строк (а не две независимые колонки):
          видео и список устройств — верхняя строка, шкала микрофона и кнопка — нижняя,
          поэтому верх и низ обеих колонок совпадают по уровню. */}
      <div className="aspect-video w-full overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-muted)] sm:col-start-1 sm:row-start-1">
        {/* Превью собственной камеры кандидата — без субтитров: контент не несёт информации для восприятия. */}
        <video ref={attachPreviewStream} autoPlay muted playsInline className="h-full w-full object-cover" />
      </div>

      {status === "granted" && (
        <div className="space-y-2 sm:col-start-2 sm:row-start-1">
          <div className="device-check-field">
            <span>Камера</span>
            <select value={cameraId} onChange={(event) => void switchDevice("video", event.target.value)}>
              {cameras.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label || "Камера"}
                </option>
              ))}
            </select>
          </div>
          <div className="device-check-field">
            <span>Микрофон</span>
            <select value={microphoneId} onChange={(event) => void switchDevice("audio", event.target.value)}>
              {microphones.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label || "Микрофон"}
                </option>
              ))}
            </select>
          </div>
          {CAN_SELECT_OUTPUT_DEVICE && (
            <div className="device-check-field">
              <span>Динамики</span>
              <select value={speakerId} onChange={(event) => setSpeakerId(event.target.value)}>
                {speakers.map((speaker) => (
                  <option key={speaker.deviceId} value={speaker.deviceId}>
                    {speaker.label || "Динамики"}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div
        className="wave-bars sm:col-start-1 sm:row-start-2"
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

      {status === "granted" && (
        <div className="flex items-center justify-end sm:col-start-2 sm:row-start-2">
          <Button type="button" onClick={confirm}>
            Начать интервью
          </Button>
        </div>
      )}
    </div>
  );
}
