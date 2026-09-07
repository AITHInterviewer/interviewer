"use client";

import { useEffect, useState } from "react";

import { loadManagedInterviewRecording } from "@/lib/auth";

type InterviewRecordingProps = {
  interviewId: string;
};

export function InterviewRecording({ interviewId }: InterviewRecordingProps) {
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (source) URL.revokeObjectURL(source);
    };
  }, [source]);

  async function loadRecording() {
    if (source || loading) return;

    setLoading(true);
    setError(null);
    try {
      setSource(URL.createObjectURL(await loadManagedInterviewRecording(interviewId)));
    } catch {
      setError("Не удалось загрузить запись. Попробуйте открыть раздел ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="interview-recording" onToggle={(event) => event.currentTarget.open && void loadRecording()}>
      <summary>
        <h2>Запись интервью</h2>
        <span className="muted-copy">Видео и аудио встречи</span>
      </summary>
      <div className="interview-recording__body">
        {loading ? <p className="muted-copy">Загружаем запись...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {source ? <video controls src={source} /> : null}
      </div>
    </details>
  );
}
