"use client";

import { useEffect, useState } from "react";

import { ApiError, type InterviewEventsResponse } from "@/lib/api";
import { loadInterviewEvents } from "@/lib/auth";

type InterviewEventsPanelProps = {
  interviewId: string;
};

export function InterviewEventsPanel({ interviewId }: InterviewEventsPanelProps) {
  const [data, setData] = useState<InterviewEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadInterviewEvents(interviewId)
      .then((response) => {
        if (!cancelled) {
          setData(response);
        }
      })
      .catch((caughtError: unknown) => {
        if (cancelled) {
          return;
        }
        if (caughtError instanceof ApiError) {
          setError(caughtError.message);
        } else if (caughtError instanceof Error) {
          setError(caughtError.message);
        } else {
          setError("Не удалось загрузить ход интервью.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [interviewId]);

  if (loading) {
    return <p className="field-hint">Loading interview events...</p>;
  }

  if (error) {
    return <p className="field-error">{error}</p>;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="interview-events-panel">
      <div className="section-heading">
        <div>
          <h3>Ответы кандидата</h3>
        </div>
      </div>
      {data.answers.length > 0 ? (
        <ul className="interview-answer-list">
          {data.answers.map((answer) => (
            <li className="candidate-card" key={answer.id}>
              <strong>{answer.question_text ?? answer.question_id}</strong>
              <p>{answer.transcript_text || "Расшифровка ещё не готова."}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">Ответов пока нет: кандидат ещё не сдал интервью.</p>
      )}

      <div className="section-heading">
        <div>
          <h3>Ход интервью</h3>
        </div>
      </div>
      {data.events.length > 0 ? (
        <ul className="interview-event-list">
          {data.events.map((event) => (
            <li className="candidate-card" key={event.id}>
              <div className="candidate-card__top">
                <span className="status">{eventLabel(event.event_type)}</span>
                <span className="field-hint">{formatMoment(event.created_at)}</span>
              </div>
              <details>
                <summary className="field-hint">Технические подробности</summary>
                <pre className="inline-code">{JSON.stringify(event.payload, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">Событий пока нет.</p>
      )}
    </div>
  );
}

/** События интервью словами: коды бэкенда в интерфейс не выносим. */
const EVENT_LABEL: Record<string, string> = {
  invited: "Приглашение создано",
  opened: "Кандидат открыл ссылку",
  consent_given: "Дал согласие на запись",
  device_checked: "Проверил микрофон",
  interview_started: "Начал интервью",
  answer_submitted: "Отправил ответ",
  interview_submitted: "Сдал интервью",
  interview_interrupted: "Прервал интервью",
  report_ready: "Отчёт готов",
  extra_requested: "Запрошен доп. ответ",
  extra_answered: "Кандидат ответил на доп. вопрос",
};

function eventLabel(code: string): string {
  return EVENT_LABEL[code] ?? code.replaceAll("_", " ");
}

function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}
