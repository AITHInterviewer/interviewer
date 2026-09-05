"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import type { Interview, InterviewEventsResponse } from "@/lib/api";
import { loadExpertQueue, loadInterviewEvents } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";

const EXPERT_AREA = "area.expert_questions";

export default function AuditCandidatePage() {
  const params = useParams<{ vacancyId: string; candidateId: string }>();
  const { landing, loading } = useProtectedLanding({ requiredArea: EXPERT_AREA });
  const [interview, setInterview] = useState<Interview | null>(null);
  const [events, setEvents] = useState<InterviewEventsResponse | null>(null);
  const [auditInQueue, setAuditInQueue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (!landing) {
      return;
    }
    let cancelled = false;

    async function loadCard() {
      try {
        const queue = await loadExpertQueue();
        if (cancelled) {
          return;
        }
        const match = queue.audits.find(
          (item) => item.interview.id === params.candidateId && String(item.vacancy_id) === params.vacancyId,
        );
        if (!match) {
          setError("Этого кандидата нет в очереди аудита.");
          return;
        }
        setInterview(match.interview);
        setAuditInQueue(true);
        const eventsPayload = await loadInterviewEvents(params.candidateId).catch(() => null);
        if (!cancelled) {
          setEvents(eventsPayload);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(normalizeError(caughtError, "Не удалось открыть карточку аудита."));
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    }

    void loadCard();
    return () => {
      cancelled = true;
    };
  }, [landing, params.candidateId, params.vacancyId]);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  return (
    <AppShell nav={buildNav(landing)} title="Аудит">
      <div className="workspace">
        {pageLoading ? <ScreenState kind="loading" title="Загрузка" text="Открываем аудит…" /> : null}
        {error ? <ScreenState kind="error" title="Нет карточки" text={error} /> : null}
        {interview ? (
          <>
            <PageHeader
              path="Аудит эксперта"
              title={interview.candidate_name ?? "Кандидат без имени"}
              description="Просмотр для эксперта: смотрите ответы и решайте, хватает ли данных. Приглашать и передавать менеджеру отсюда нельзя."
            />
            <section className="plain-section">
              <h2>Запрос рекрутера</h2>
              <p>
                {auditInQueue
                  ? "Рекрутер попросил ваш взгляд на этот отчёт."
                  : "Этот отчёт в вашей очереди не числится: вы открыли его по ссылке."}
              </p>
            </section>
            <section className="plain-section">
              <h2>Ответы кандидата</h2>
              {events?.answers.length ? (
                <ul className="stack-list">
                  {events.answers.map((answer) => (
                    <li className="answer-record" key={answer.id}>
                      <strong>{answer.question_text ?? "Вопрос без текста"}</strong>
                      {answer.transcript_text ? (
                        <blockquote>{answer.transcript_text}</blockquote>
                      ) : (
                        <p className="muted-copy">Расшифровка этого ответа ещё не готова.</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-copy">
                  Расшифровок пока нет. Они появятся, когда ответы обработаются.
                </p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
