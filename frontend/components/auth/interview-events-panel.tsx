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
          setError("Could not load interview events.");
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
          <h3>Answers</h3>
        </div>
      </div>
      {data.answers.length > 0 ? (
        <ul className="interview-answer-list">
          {data.answers.map((answer) => (
            <li className="candidate-card" key={answer.id}>
              <strong>{answer.question_text ?? answer.question_id}</strong>
              <p>{answer.transcript_text || "(no transcript yet)"}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">No aggregated answers yet.</p>
      )}

      <div className="section-heading">
        <div>
          <h3>Event timeline</h3>
        </div>
      </div>
      {data.events.length > 0 ? (
        <ul className="interview-event-list">
          {data.events.map((event) => (
            <li className="candidate-card" key={event.id}>
              <div className="candidate-card__top">
                <span className="status">{event.event_type}</span>
                <span className="field-hint">{event.created_at}</span>
              </div>
              <pre className="inline-code">{JSON.stringify(event.payload, null, 2)}</pre>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">No events recorded yet.</p>
      )}
    </div>
  );
}
