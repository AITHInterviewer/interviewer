"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export type DeviceCheckStatus = "checking" | "granted" | "denied";

type DeviceCheckProps = {
  /** Вызывается ровно один раз, когда доступ к камере+микрофону подтверждён и остаётся
   * активным — сигнал наверх, что можно переходить к интервью
   * (specs/004-candidate-interview-flow/spec.md, US1, Acceptance Scenario 2). */
  onGranted: (stream: MediaStream) => void;
};

/**
 * Живая проверка камеры/микрофона на welcome-экране (FR-002/FR-013): запрашивает
 * getUserMedia сразу при монтировании, показывает превью видео + индикатор уровня
 * микрофона через Web Audio AnalyserNode, при отказе показывает блокирующий экран с
 * повторным запросом (US1, Acceptance Scenario 3) — без перехода дальше, пока доступ не
 * выдан.
 */
export function DeviceCheck({ onGranted }: DeviceCheckProps) {
  const [status, setStatus] = useState<DeviceCheckStatus>("checking");
  const [micLevel, setMicLevel] = useState(0);
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

  const startMicLevelLoop = useCallback((stream: MediaStream) => {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
  }, []);

  /** Собственно запрос доступа. Не трогает `status` синхронно — только в асинхронном
   * продолжении, чтобы вызов из эффекта не порождал каскадный ре-рендер
   * (react-hooks/set-state-in-effect). Начальное состояние и так `checking`. */
  const acquire = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      startMicLevelLoop(stream);
      setStatus("granted");
      onGranted(stream);
    } catch {
      setStatus("denied");
    }
  }, [onGranted, startMicLevelLoop]);

  /** Повторный запрос после отказа (US1, Acceptance Scenario 3) — здесь `checking`
   * выставляется явно, т.к. приходим из состояния `denied`. */
  const retry = useCallback(() => {
    setStatus("checking");
    void acquire();
  }, [acquire]);

  useEffect(() => {
    // react-hooks/set-state-in-effect срабатывает статически на «функция, вызывающая
    // setState, вызвана из эффекта». Здесь setState происходит только в асинхронном
    // продолжении после `await getUserMedia(...)` — каскадного ре-рендера в теле эффекта
    // нет. Сам запрос разрешения при монтировании — ровно тот случай, для которого эффект
    // и предназначен: синхронизация с внешней системой (браузерные media-разрешения).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void acquire();
    return () => {
      stopMicLevelLoop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- запрашиваем доступ один раз при монтировании
  }, []);

  if (status === "denied") {
    return (
      <div
        role="alert"
        className="space-y-4 rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center"
      >
        <h2 className="text-lg font-medium">Нет доступа к камере или микрофону</h2>
        <p className="text-sm text-muted-foreground">
          Без доступа к камере и микрофону интервью пройти нельзя — вся запись служит доказательством
          для рекрутёра. Разрешите доступ в настройках браузера и попробуйте снова.
        </p>
        <Button type="button" onClick={retry}>
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
          {status === "checking" ? "Запрашиваем доступ к камере и микрофону…" : "Микрофон активен"}
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
    </div>
  );
}
