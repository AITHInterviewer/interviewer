"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Microphone } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { LaptopGate } from "@/components/chrome/LaptopGate";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { readSession, updateSession } from "@/lib/demo/session";

export default function CheckPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const candidate = getCandidateByToken(params.token);
  const [recording, setRecording] = useState(false);
  const [heard, setHeard] = useState(false);
  const [textOnly, setTextOnly] = useState(() =>
    typeof window !== "undefined" && candidate ? readSession(candidate.token).textOnly : false,
  );
  const [micDenied, setMicDenied] = useState(false);
  const [levels, setLevels] = useState([2, 4, 7, 5, 8, 4, 6, 3, 7, 5, 2, 4]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!candidate) {
    return (
      <main className="workspace">
        <ScreenState
          kind="error"
          title="Ссылка не найдена"
          text="Такого приглашения в демо нет. Вернитесь ко входу и выберите роль кандидата."
          action={
            <Button asChild variant="secondary">
              <Link href="/login">К выбору роли</Link>
            </Button>
          }
        />
      </main>
    );
  }

  async function recordSample() {
    setRecording(true);
    setHeard(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = window.setInterval(() => {
        analyser.getByteFrequencyData(data);
        const next = Array.from({ length: 12 }, (_, i) => Math.max(2, Math.round(data[i * 8] / 20)));
        setLevels(next);
      }, 120);
      timerRef.current = window.setTimeout(() => {
        window.clearInterval(tick);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        setRecording(false);
        setHeard(true);
      }, 5000);
    } catch {
      setMicDenied(true);
      setRecording(true);
      timerRef.current = window.setTimeout(() => {
        setRecording(false);
        setHeard(true);
      }, 5000);
    }
  }

  return (
    <LaptopGate>
      <CandidateShell step="Проверка">
        <section className="setup-stage" style={{ width: "100%" }}>
          <h1>Проверим микрофон</h1>
          <p>Скажите несколько слов. Полосы должны двигаться без рывков.</p>
          <div className="device-check">
            <div className="wave-bars" aria-label="Уровень микрофона">
              {levels.map((height, index) => (
                <i key={index} style={{ height: `${height * 6}px` }} />
              ))}
            </div>
            <span className="status" data-tone={heard ? "positive" : "neutral"}>
              {heard ? "Микрофон работает" : recording ? "Идёт запись" : "Ожидание"}
            </span>
          </div>
          <Button variant="secondary" type="button" onClick={() => void recordSample()} disabled={recording}>
            <Microphone size={18} />
            {heard ? "Записать ещё раз" : "Записать 5 секунд"}
          </Button>
          {micDenied ? (
            <p style={{ marginTop: 16, color: "var(--ink-secondary)", fontSize: 14 }}>
              Доступ к микрофону не получен. Можно пройти интервью текстом.
            </p>
          ) : null}
          <label className="consent-row" style={{ marginTop: 18 }}>
            <input
              type="checkbox"
              checked={textOnly}
              onChange={(e) => {
                setTextOnly(e.target.checked);
                updateSession(candidate.token, { textOnly: e.target.checked });
              }}
            />
            <span>
              <strong>Отвечать текстом на все вопросы</strong>
              <small>Сохраняется в сессии браузера.</small>
            </span>
          </label>
          <p style={{ marginTop: 18, color: "var(--ink-secondary)", fontSize: 14 }}>
            Соединение: стабильное
          </p>
          <div className="setup-stage__footer">
            <Button asChild variant="text">
              <Link href={`/i/${candidate.token}/consent`}>
                <ArrowLeft size={16} />
                Назад
              </Link>
            </Button>
            <Button
              type="button"
              disabled={!heard && !textOnly}
              onClick={() => router.push(`/i/${candidate.token}/rules`)}
            >
              Всё работает
              <ArrowRight size={17} />
            </Button>
          </div>
        </section>
      </CandidateShell>
    </LaptopGate>
  );
}
