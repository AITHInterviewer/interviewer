"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SkeletonText } from "@/components/ui/skeleton";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import type {
  ClarificationRequest,
  Interview,
  InterviewEventsResponse,
  StaffManager,
  VacancyDetail,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import {
  closeManagedClarification,
  grantManagedOpinion,
  handoffManagedInterview,
  loadClarifications,
  loadHiringManagers,
  loadInterview,
  loadInterviewEvents,
  loadVacancy,
  requestManagedAudit,
  requestManagedExtra,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { interviewStageLabel } from "@/lib/pipeline";
import {
  buildRequirementMap,
  CONCLUSION_LABEL,
  COVERAGE_LABEL,
  isReportProcessing,
  mandatorySummary,
  requirementConclusion,
  uncoveredRequirements,
  type RequirementCoverage,
} from "@/lib/report";
import { buildNav, vacancyBreadcrumbs } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";
const OPEN_CLARIFICATION = new Set(["requested", "received", "in_progress"]);

function extraLink(accessToken: string, clarificationId: string): string {
  if (typeof window === "undefined") {
    return `/i/${accessToken}/extra/${clarificationId}`;
  }
  return `${window.location.origin}/i/${accessToken}/extra/${clarificationId}`;
}

function reportLabel(interview: Interview): string {
  if (interview.product_state === "report_ready") return "Отчёт готов: решение за вами.";
  return "Отчёт готовится. Обычно это занимает около часа после сдачи.";
}

/** Тон пилюли под наличие ответа. Не confirmed: наличие ≠ подтверждение навыка. */
function coverageTone(coverage: RequirementCoverage): StatusTone {
  if (coverage === "answered") return "neutral";
  if (coverage === "asked") return "insufficient";
  return "unchecked";
}

const VERDICT_LABEL: Record<"fits" | "not_fits" | "needs_review", string> = {
  fits: "Подходит по обязательным навыкам",
  not_fits: "Не подходит по обязательным навыкам",
  needs_review: "Нужна доп. проверка",
};

function verdictTone(verdict: "fits" | "not_fits" | "needs_review"): StatusTone {
  if (verdict === "fits") return "neutral";
  if (verdict === "not_fits") return "insufficient";
  return "unchecked";
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
  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  const requirements = useMemo(
    () => (vacancy ? buildRequirementMap(vacancy, vacancy.questions, events?.answers ?? []) : []),
    [events, vacancy],
  );
  const mandatory = mandatorySummary(requirements);
  const uncovered = uncoveredRequirements(requirements);
  const selected =
    requirements.find((row) => row.skill === selectedSkill) ?? requirements[0] ?? null;
  const processing = interview ? isReportProcessing(interview) : false;
  const unansweredMandatory = requirements.filter((row) => row.mandatory && row.coverage !== "answered");

  async function refreshClarifications() {
    const response = await loadClarifications(params.cid);
    setClarifications(response.items);
  }

  useEffect(() => {
    if (!landing) {
      return;
    }
    let cancelled = false;

    async function loadCard() {
      try {
        const item = await loadInterview(params.cid);
        if (cancelled) {
          return;
        }
        setInterview(item);
        const [clarificationResponse, managerResponse, eventsPayload, vacancyDetail] = await Promise.all([
          loadClarifications(params.cid),
          canManage ? loadHiringManagers() : Promise.resolve({ items: [] as StaffManager[] }),
          loadInterviewEvents(params.cid).catch(() => null),
          loadVacancy(params.id).catch(() => null),
        ]);
        if (cancelled) {
          return;
        }
        setClarifications(clarificationResponse.items);
        setManagers(managerResponse.items);
        setEvents(eventsPayload);
        setVacancy(vacancyDetail);
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
  }, [landing, params.cid, params.id, canManage]);

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
        {pageLoading ? <SkeletonText lines={4} label="Открываю карточку" /> : null}
        {error && !interview ? <ScreenState kind="error" title="Нет карточки" text={error} /> : null}
        {interview ? (
          <>
            <PageHeader
              breadcrumbs={
                vacancy
                  ? vacancyBreadcrumbs(
                      params.id,
                      vacancy.title,
                      interview.candidate_name ?? "Кандидат без имени",
                    )
                  : [{ label: "Вакансии", href: "/vacancies" }]
              }
              title={interview.candidate_name ?? "Кандидат без имени"}
              description={interviewStageLabel(interview)}
            />
            {error ? <p className="form-error">{error}</p> : null}
            {status ? <p className="success-message">{status}</p> : null}

            <section className="report-summary">
              <div>
                <h2>
                  Что видно из ответов
                  {interview.report_json ? (
                    <StatusPill tone={verdictTone(interview.report_json.verdict)}>
                      {VERDICT_LABEL[interview.report_json.verdict]}
                    </StatusPill>
                  ) : null}
                </h2>
                <p className="muted-copy">
                  {processing
                    ? "Интервью завершено, отчёт собирается"
                    : `Это разбор ответов системой, а не решение о найме. ${reportLabel(interview)}`}
                </p>
              </div>
              {!processing && unansweredMandatory.length > 0 ? (
                <p className="report-gap">
                  По требованию{" "}
                  {unansweredMandatory.map((row) => `«${row.skill}»`).join(", ")} ответ не получен.
                  Можно задать доп. вопрос или запросить аудит.
                </p>
              ) : null}
              {processing ? null : (
                <dl className="report-figures">
                  <div>
                    <dt>Обязательные требования</dt>
                    <dd>
                      По обязательным требованиям есть ответы: {mandatory.answered} из {mandatory.total}. Это
                      не подтверждение навыка.
                    </dd>
                  </div>
                  <div>
                    <dt>Ответов с расшифровкой</dt>
                    <dd>
                      {events?.answers.filter((item) => item.transcript_text).length ?? 0} из{" "}
                      {vacancy?.questions.length ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt>Не закрыл ни один вопрос</dt>
                    <dd>{uncovered.length === 0 ? "таких требований нет" : uncovered.map((row) => row.skill).join(", ")}</dd>
                  </div>
                </dl>
              )}
            </section>

            <section className="requirement-map">
              <div className="requirement-map__list">
                <header>
                  <h2>Карта требований</h2>
                  <span className="muted-copy">
                    {processing
                      ? "Расшифровки ещё могут появиться — это не итоговый пробел"
                      : "Выберите строку, чтобы увидеть ответ целиком"}
                  </span>
                </header>
                {requirements.length === 0 ? (
                  <p className="muted-copy" style={{ padding: "16px 20px" }}>
                    У вакансии не заполнены требования, сопоставлять нечего.
                  </p>
                ) : (
                  requirements.map((row) => (
                    <button
                      className="requirement-row"
                      type="button"
                      key={row.skill}
                      data-selected={row.skill === selectedSkill}
                      onClick={() => setSelectedSkill(row.skill)}
                    >
                      <span>
                        <strong>{row.skill}</strong>
                        <span className="muted-copy">
                          {row.mandatory ? "Обязательное" : "Желательное"}
                          {row.questions.length > 0
                            ? ` · вопрос ${row.questions.map((question) => question.order).join(", ")}`
                            : " · вопроса нет"}
                        </span>
                      </span>
                      <StatusPill tone={coverageTone(row.coverage)}>{COVERAGE_LABEL[row.coverage]}</StatusPill>
                    </button>
                  ))
                )}
              </div>

              <aside className="requirement-detail">
                {selected ? (
                  <>
                    <div>
                      <h2>{selected.skill}</h2>
                      <span className="muted-copy">
                        {selected.mandatory ? "Обязательное требование" : "Желательное требование"}
                      </span>
                      <p className="muted-copy">
                        {processing
                          ? "Отчёт ещё собирается — это не итог по навыку."
                          : CONCLUSION_LABEL[requirementConclusion(selected)]}
                      </p>
                    </div>
                    {selected.answers.length > 0 ? (
                      selected.answers.map(({ question, answer }) => (
                        <div className="answer-record" key={answer.id}>
                          <strong>
                            Вопрос {question.order}. {question.text}
                          </strong>
                          <blockquote>{answer.transcript_text}</blockquote>
                          {question.reference_answer ? (
                            <p className="muted-copy">
                              Эксперт ждал: {question.reference_answer}
                            </p>
                          ) : null}
                          {(() => {
                            const scored = interview.report_json?.per_question.find(
                              (row) => row.question_id === question.id,
                            );
                            if (!scored) return null;
                            return (
                              <p className="muted-copy">
                                Оценка модели: {scored.score}/100
                                {scored.answered_with_hint ? " (с подсказкой)" : ""}
                                {scored.rationale ? ` — ${scored.rationale}` : ""}
                              </p>
                            );
                          })()}
                        </div>
                      ))
                    ) : selected.coverage === "asked" ? (
                      <p className="muted-copy">
                        {processing
                          ? "Расшифровка ещё может появиться — отчёт собирается."
                          : `Вопрос ${selected.questions.map((question) => question.order).join(", ")} задавали, но расшифровки ответа нет. Это пробел в данных, а не минус кандидату.`}
                      </p>
                    ) : (
                      <p className="muted-copy">
                        Ни один вопрос комплекта не закрывает это требование. Дыра в калибровке: её
                        стоит закрыть эксперту, а не считать ответом кандидата.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="muted-copy">Выберите требование слева.</p>
                )}
              </aside>
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
