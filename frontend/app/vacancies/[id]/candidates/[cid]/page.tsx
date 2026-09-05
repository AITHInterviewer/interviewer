"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import type { ClarificationRequest, Interview, InterviewEventsResponse, StaffManager } from "@/lib/api";
import { ApiError } from "@/lib/api";
import {
  closeManagedClarification,
  grantManagedOpinion,
  handoffManagedInterview,
  loadClarifications,
  loadHiringManagers,
  loadInterview,
  loadInterviewEvents,
  requestManagedAudit,
  requestManagedExtra,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { interviewStageLabel } from "@/lib/pipeline";
import { buildNav } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";
const OPEN_CLARIFICATION = new Set(["requested", "received", "in_progress"]);

function extraLink(accessToken: string, clarificationId: string): string {
  if (typeof window === "undefined") {
    return `/i/${accessToken}/extra/${clarificationId}`;
  }
  return `${window.location.origin}/i/${accessToken}/extra/${clarificationId}`;
}

function reportLabel(interview: Interview): string {
  if (interview.report_status === "ready") return "Отчёт готов: решение за вами.";
  if (interview.report_status === "updated_extra") return "Отчёт обновлён после доп. ответа кандидата.";
  if (interview.report_status === "expert_reviewed") return "Эксперт разобрал отчёт и оставил отметку.";
  return "Отчёт готовится. Обычно это занимает около часа после сдачи.";
}

/** Статус уточнения словами: коды open/closed в интерфейс не выносим. */
function clarificationStatusLabel(status: string): string {
  if (status === "open") return "ждёт ответа";
  if (status === "closed") return "закрыт";
  if (status === "answered") return "кандидат ответил";
  return status;
}

export default function VacancyCandidatePage() {
  const params = useParams<{ id: string; cid: string }>();
  const { landing, loading } = useProtectedLanding();
  const canManage = landing?.available_areas.some((area) => area.id === RECRUITER_AREA) ?? false;

  const [interview, setInterview] = useState<Interview | null>(null);
  const [events, setEvents] = useState<InterviewEventsResponse | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationRequest[]>([]);
  const [managers, setManagers] = useState<StaffManager[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [managerId, setManagerId] = useState("");
  const [summary, setSummary] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function refreshClarifications() {
    const response = await loadClarifications(params.cid);
    setClarifications(response.items);
  }

  useEffect(() => {
    if (!landing) {
      return;
    }
    let cancelled = false;
    setPageLoading(true);

    async function loadCard() {
      try {
        const item = await loadInterview(params.cid);
        if (cancelled) {
          return;
        }
        setInterview(item);
        const [clarificationResponse, managerResponse, eventsPayload] = await Promise.all([
          loadClarifications(params.cid),
          canManage ? loadHiringManagers() : Promise.resolve({ items: [] as StaffManager[] }),
          loadInterviewEvents(params.cid).catch(() => null),
        ]);
        if (cancelled) {
          return;
        }
        setClarifications(clarificationResponse.items);
        setManagers(managerResponse.items);
        setEvents(eventsPayload);
      } catch (caughtError) {
        if (!cancelled) {
          setError(normalizeError(caughtError, "Не удалось загрузить карточку."));
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
  }, [landing, params.cid, canManage]);

  const openClarifications = clarifications.filter((item) => OPEN_CLARIFICATION.has(item.status));
  const handoffBlocked = openClarifications.length > 0;
  const extras = clarifications.filter((item) => item.type === "extra");
  const audits = clarifications.filter((item) => item.type === "expert_audit");

  async function handleExtra() {
    setBusy(true);
    setError(null);
    try {
      const item = await requestManagedExtra(params.cid);
      await refreshClarifications();
      if (interview) {
        setStatus(`Запросили доп. ответ. Ссылка: ${extraLink(interview.access_token, item.id)}. Отправьте её сами.`);
      } else {
        setStatus("Запросили доп. ответ. Отправьте ссылку сами.");
      }
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось запросить доп. ответ."));
    } finally {
      setBusy(false);
    }
  }

  async function handleAudit() {
    setBusy(true);
    setError(null);
    try {
      await requestManagedAudit(params.cid);
      await refreshClarifications();
      setStatus("Запросили аудит эксперта.");
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось запросить аудит."));
    } finally {
      setBusy(false);
    }
  }

  async function handleClose(clarificationId: string) {
    if (!closeReason.trim()) {
      setError("Чтобы закрыть уточнение, напишите причину.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await closeManagedClarification(params.cid, clarificationId, closeReason.trim());
      await refreshClarifications();
      setCloseReason("");
      setStatus("Уточнение закрыто.");
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось закрыть уточнение."));
    } finally {
      setBusy(false);
    }
  }

  async function handleHandoff() {
    if (!managerId.trim() || !summary.trim()) {
      setError("Нужны менеджер и короткое саммари.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await handoffManagedInterview(params.cid, { to_manager_id: managerId.trim(), summary: summary.trim() });
      setInterview((current) => (current ? { ...current, recruiter_decision: "handed_off" } : current));
      setStatus("Передано менеджеру.");
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 409) {
        setError("Сначала закройте открытые уточнения — иначе передать нельзя.");
      } else {
        setError(normalizeError(caughtError, "Не удалось передать менеджеру."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleOpinion() {
    if (!managerId.trim()) {
      setError("Выберите менеджера, чтобы запросить мнение.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await grantManagedOpinion(params.cid, managerId.trim());
      setStatus("Менеджеру открыли доступ к мнению, без передачи кандидата.");
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось открыть мнение менеджеру."));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  return (
    <AppShell nav={buildNav(landing)} title="Кандидат">
      <div className="workspace">
        {pageLoading ? <ScreenState kind="loading" title="Загрузка" text="Открываем карточку…" /> : null}
        {error && !interview ? <ScreenState kind="error" title="Нет карточки" text={error} /> : null}
        {interview ? (
          <>
            <PageHeader
              path="Вакансии"
              title={interview.candidate_name ?? "Кандидат без имени"}
              description={interviewStageLabel(interview)}
            />
            {error ? <p className="form-error">{error}</p> : null}
            {status ? <p className="success-message">{status}</p> : null}

            <section className="plain-section">
              <h2>Технический отчёт</h2>
              <p>{reportLabel(interview)}</p>
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
                <p>
                  Расшифровок ещё нет. Когда ответы обработаются, здесь появятся цитаты с
                  таймкодами по каждому требованию.
                </p>
              )}
            </section>

            {canManage ? (
              <section className="plain-section">
                <h2>Уточнения</h2>
                <div className="form-actions">
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void handleExtra()}>
                    Запросить доп. ответ
                  </Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void handleAudit()}>
                    Запросить аудит
                  </Button>
                </div>
                {extras.length > 0 ? (
                  <ul className="stack-list">
                    {extras.map((item) => (
                      <li key={item.id}>
                        Доп. вопрос: {clarificationStatusLabel(item.status)} ·{" "}
                        {extraLink(interview.access_token, item.id)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {audits.length > 0 ? (
                  <ul className="stack-list">
                    {audits.map((item) => (
                      <li key={item.id}>
                        Аудит эксперта: {clarificationStatusLabel(item.status)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {openClarifications.length > 0 ? (
                  <div>
                    {openClarifications.map((item) => (
                      <p key={item.id}>
                        {item.type === "extra" ? "Доп. вопрос" : "Аудит эксперта"} ждёт ответа
                        <button className="text-button" type="button" onClick={() => void handleClose(item.id)}>
                          Закрыть с причиной
                        </button>
                      </p>
                    ))}
                    <label>
                      Причина закрытия
                      <input value={closeReason} onChange={(event) => setCloseReason(event.target.value)} />
                    </label>
                  </div>
                ) : (
                  <p>Открытых уточнений нет.</p>
                )}
              </section>
            ) : null}

            {canManage ? (
              <section className="plain-section">
                <h2>Решение</h2>
                <p className="muted-copy">
                  Система собирает наблюдения, решение принимает человек. Передача менеджеру
                  открывает ему карточку и ваш комментарий.
                </p>
                <div className="form-surface">
                <label>
                  Менеджер
                  <select value={managerId} onChange={(event) => setManagerId(event.target.value)}>
                    <option value="">Выберите менеджера</option>
                    {managers.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name} ({manager.email})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Что рассказать менеджеру
                  <textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
                </label>
                </div>
                <div className="form-actions">
                  <Button type="button" disabled={busy || handoffBlocked} onClick={() => void handleHandoff()}>
                    Передать менеджеру
                  </Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void handleOpinion()}>
                    Спросить мнение менеджера
                  </Button>
                  <Button type="button" variant="secondary" disabled>
                    Не продолжаем
                  </Button>
                </div>
                {handoffBlocked ? (
                  <p className="disabled-hint">Сначала закройте открытые уточнения.</p>
                ) : null}
                <p className="disabled-hint">
                  «Не продолжаем» появится после пилота: пока решение об отказе фиксируется вне системы.
                </p>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
