"use client";

import { useCallback, useEffect, useState } from "react";

import { getInterviewCard, startInterview, type InterviewCard } from "@/lib/api";
import { formatMoscowDateTime } from "@/lib/vacancies";

const REASON_TEXT: Record<string, { title: string; body: string }> = {
  expired: {
    title: "Ссылка недоступна — время вышло",
    body: "Срок действия ссылки истёк. Свяжитесь с рекрутером, чтобы получить новую.",
  },
  revoked: {
    title: "Ссылка недоступна — закрыта рекрутером",
    body: "Рекрутер закрыл доступ по этой ссылке. Если это ошибка, свяжитесь с ним напрямую.",
  },
  vacancy_closed: {
    title: "Ссылка недоступна — вакансия закрыта",
    body: "Эта вакансия сейчас не открыта для интервью. Свяжитесь с рекрутером.",
  },
};

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function InterviewClient({ token }: { token: string }) {
  const [card, setCard] = useState<InterviewCard | null>(null);
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    getInterviewCard(token)
      .then((response) => {
        if (!cancelled) {
          setCard(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (card?.state !== "in_progress" || !card.deadline_at) {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [card?.state, card?.deadline_at]);

  const deadlineMs =
    card?.state === "in_progress" && card.deadline_at
      ? new Date(card.deadline_at).getTime()
      : null;
  const timeLeftMs = deadlineMs === null ? null : deadlineMs - now;

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      const started = await startInterview(token);
      setCard(started);
    } catch {
      // State changed server-side (expired/revoked/closed) — refresh the card.
      try {
        setCard(await getInterviewCard(token));
      } catch {
        setFailed(true);
      }
    } finally {
      setStarting(false);
    }
  }, [token]);

  if (failed) {
    return (
      <main className="interview-page">
        <div className="candidate-card interview-card">
          <h1>Ссылка недоступна</h1>
          <p className="interview-card__hint">
            Не удалось загрузить интервью. Проверьте адрес ссылки или свяжитесь с рекрутером.
          </p>
        </div>
      </main>
    );
  }

  if (!card) {
    return (
      <main className="interview-page">
        <div className="candidate-card interview-card">
          <p className="interview-card__hint">Загружаем интервью…</p>
        </div>
      </main>
    );
  }

  if (card.state === "unavailable") {
    const reason = REASON_TEXT[card.reason ?? "vacancy_closed"];
    return (
      <main className="interview-page">
        <div className="candidate-card interview-card">
          <p className="interview-card__eyebrow">{card.vacancy_title}</p>
          <h1>{reason.title}</h1>
          <p className="interview-card__hint">{reason.body}</p>
        </div>
      </main>
    );
  }

  if (card.state === "completed") {
    return (
      <main className="interview-page">
        <div className="candidate-card interview-card">
          <p className="interview-card__eyebrow">{card.vacancy_title}</p>
          <h1>Интервью завершено</h1>
          <p className="interview-card__hint">
            {card.candidate_first_name}, спасибо! Ваши ответы отправлены на проверку.
          </p>
        </div>
      </main>
    );
  }

  if (card.state === "in_progress") {
    const timeUp = timeLeftMs !== null && timeLeftMs <= 0;
    return (
      <main className="interview-page">
        <div className="candidate-card interview-card">
          <p className="interview-card__eyebrow">{card.vacancy_title}</p>
          {timeUp ? (
            <>
              <h1>Время вышло</h1>
              <p className="interview-card__hint">
                Лимит времени на интервью исчерпан. Ваши ответы сохранены и будут проверены.
              </p>
            </>
          ) : (
            <>
              <h1>Интервью идёт</h1>
              <p className="interview-card__hint">
                {card.candidate_first_name}, оставшееся время:
              </p>
              <p className="interview-countdown" aria-live="polite">
                {timeLeftMs === null ? "—" : formatCountdown(timeLeftMs)}
              </p>
              <p className="interview-card__hint">
                Интерфейс интервью скоро появится здесь. Не закрывайте страницу.
              </p>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="interview-page">
      <div className="candidate-card interview-card">
        <p className="interview-card__eyebrow">{card.vacancy_title}</p>
        <h1>Интервью для {card.candidate_first_name}</h1>
        <dl className="interview-facts">
          <div>
            <dt>Доступно до</dt>
            <dd>{formatMoscowDateTime(card.expires_at)}</dd>
          </div>
          <div>
            <dt>Длительность интервью</dt>
            <dd>{card.interview_time_limit_minutes} мин</dd>
          </div>
        </dl>
        <button
          type="button"
          className="button button--primary button--large interview-start"
          disabled={starting}
          onClick={() => void handleStart()}
        >
          {starting ? "Начинаем…" : "Начать интервью"}
        </button>
        <p className="interview-card__hint">
          После нажатия запустится отсчёт {card.interview_time_limit_minutes} минут — его нельзя
          остановить.
        </p>
      </div>
    </main>
  );
}
