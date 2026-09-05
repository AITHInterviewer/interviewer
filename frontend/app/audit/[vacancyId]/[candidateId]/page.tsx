"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import type { ClarificationRequest, Interview, InterviewEventsResponse } from "@/lib/api";
import {
  closeManagedClarification,
  loadClarifications,
  loadExpertQueue,
  loadInterviewEvents,
  requestManagedExtra,
} from "@/lib/auth";
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
  const [clarifications, setClarifications] = useState<ClarificationRequest[]>([]);
  const [verdictBusy, setVerdictBusy] = useState<"enough" | "extra" | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const openAudit = clarifications.find((item) => item.type === "expert_audit" && item.status === "open");

  /** «Данных хватает»: закрываем запрос рекрутера с причиной. */
  async function markEnough() {
    if (!openAudit) return;
    setVerdictBusy("enough");
    setError(null);
    try {
      await closeManagedClarification(params.candidateId, openAudit.id, reason.trim() || "Данных хватает");
      const fresh = await loadClarifications(params.candidateId);
      setClarifications(fresh.items);
      setVerdict("Отметка сохранена: данных хватает. Рекрутер увидит её на отчёте.");
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось сохранить отметку."));
    } finally {
      setVerdictBusy(null);
    }
  }

  /** «Нужен доп. вопрос»: заказываем точечное уточнение кандидату. */
  async function askExtra() {
    setVerdictBusy("extra");
    setError(null);
    try {
      await requestManagedExtra(params.candidateId);
      const fresh = await loadClarifications(params.candidateId);
      setClarifications(fresh.items);
      setVerdict("Доп. вопрос заказан. Ссылку кандидату отправляет рекрутер.");
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось заказать доп. вопрос."));
    } finally {
      setVerdictBusy(null);
    }
  }

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
        const [eventsPayload, clarificationList] = await Promise.all([
          loadInterviewEvents(params.candidateId).catch(() => null),
          loadClarifications(params.candidateId).catch(() => ({ items: [] as ClarificationRequest[] })),
        ]);
        if (!cancelled) {
          setEvents(eventsPayload);
          setClarifications(clarificationList.items);
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
              <h2>Ваш ответ рекрутеру</h2>
              <p>
                {auditInQueue
                  ? "Рекрутер попросил ваш взгляд на этот отчёт. Пока вы не ответили, он не передаёт кандидата дальше."
                  : "Этот отчёт в вашей очереди не числится: вы открыли его по ссылке."}
              </p>
              {verdict ? <p className="success-message">{verdict}</p> : null}
              {openAudit ? (
                <>
                  <label className="field">
                    Комментарий рекрутеру
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Например: по асинхронности данных достаточно, очереди можно добрать на встрече"
                      rows={3}
                    />
                  </label>
                  <div className="form-actions">
                    <Button
                      type="button"
                      loading={verdictBusy === "enough"}
                      loadingLabel="Сохраняю…"
                      disabled={verdictBusy !== null}
                      onClick={() => void markEnough()}
                    >
                      Данных хватает
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      loading={verdictBusy === "extra"}
                      loadingLabel="Заказываю…"
                      disabled={verdictBusy !== null}
                      onClick={() => void askExtra()}
                    >
                      Нужен доп. вопрос
                    </Button>
                  </div>
                </>
              ) : (
                <p className="muted-copy">
                  Открытого запроса на аудит нет: отвечать нечего. Можно просто посмотреть ответы.
                </p>
              )}
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
