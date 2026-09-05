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
import { clarificationStatusLabel, isClarificationOpen, openClarifications } from "@/lib/clarifications";
import { normalizeError } from "@/lib/errors";
import { interviewStageLabel } from "@/lib/pipeline";
import {
  analysisSourceLabel,
  buildRequirementMap,
  CONCLUSION_LABEL,
  COVERAGE_LABEL,
  isReportProcessing,
  mandatoryGapWarning,
  mandatorySummary,
  optionalGapRows,
  PROCESSING_COPY,
  requirementConclusion,
  uncoveredRequirements,
  type RequirementCoverage,
} from "@/lib/report";
import { buildNav, vacancyBreadcrumbs } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";

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

/** Тон пилюли под наличие ответа. Не confirmed: наличие ≠ подтверждение навыка. */
function coverageTone(coverage: RequirementCoverage): StatusTone {
  if (coverage === "answered") return "neutral";
  if (coverage === "asked") return "insufficient";
  return "unchecked";
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
  const optionalGaps = optionalGapRows(requirements);
  const gapWarning = mandatoryGapWarning(requirements);
  const selected =
    requirements.find((row) => row.skill === selectedSkill) ?? requirements[0] ?? null;
  const processing = interview ? isReportProcessing(interview) : false;

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

  const openItems = openClarifications(clarifications);
  const handoffBlocked = openItems.length > 0;
  const extras = clarifications.filter((item) => item.type === "extra");
  const audits = clarifications.filter((item) => item.type === "expert_audit");
  const hasOpenExtra = extras.some((item) => isClarificationOpen(item.status));
  const hasOpenAudit = audits.some((item) => isClarificationOpen(item.status));

  async function handleExtra() {
    if (hasOpenExtra || busy) return;
    setBusy(true);
    setError(null);
    try {
      const item = await requestManagedExtra(params.cid);
      await refreshClarifications();
      if (interview) {
        setStatus(
          `Ссылка для кандидата: ${extraLink(interview.access_token, item.id)}. Отправьте её кандидату самостоятельно.`,
        );
      } else {
        setStatus("Запросили доп. ответ. Отправьте ссылку кандидату самостоятельно.");
      }
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось запросить доп. ответ."));
    } finally {
      setBusy(false);
    }
  }

  async function handleAudit() {
    if (hasOpenAudit || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestManagedAudit(params.cid);
      await refreshClarifications();
      setStatus(
        "Запросили аудит эксперта. Требование и причина в запросе не сохраняются — их увидит эксперт в очереди, если бэкенд их добавит.",
      );
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

            {/* 1. Контекст вакансии и интервью */}
            <section className="report-summary" aria-labelledby="report-context-heading">
              <div>
                <h2 id="report-context-heading">Контекст</h2>
                <p className="muted-copy">
                  {vacancy ? (
                    <>
                      Вакансия «{vacancy.title}»
                      {vacancy.grade ? ` · ${vacancy.grade}` : ""}. Стадия: {interviewStageLabel(interview)}.
                    </>
                  ) : (
                    <>Стадия: {interviewStageLabel(interview)}.</>
                  )}
                </p>
              </div>
              <nav className="report-jumps" aria-label="Переход по отчёту">
                <a className="text-button" href="#requirements">
                  К требованиям
                </a>
                {canManage ? (
                  <a className="text-button" href="#next-step">
                    К следующему шагу
                  </a>
                ) : null}
              </nav>
            </section>

            {/* 2. Состояние обработки */}
            <section className="report-summary" aria-labelledby="report-processing-heading">
              <div>
                <h2 id="report-processing-heading">Состояние обработки</h2>
                <p className="muted-copy">
                  {processing ? PROCESSING_COPY : reportLabel(interview)}
                </p>
                {!processing ? (
                  <p className="muted-copy">
                    Это разбор ответов системой, а не решение о найме.
                  </p>
                ) : null}
              </div>
            </section>

            {/* 3. Обязательные требования с пробелами */}
            {!processing ? (
              <section className="report-summary" aria-labelledby="report-gaps-heading">
                <div>
                  <h2 id="report-gaps-heading">Обязательные требования</h2>
                  <p className="muted-copy">
                    По обязательным требованиям есть ответы: {mandatory.answered} из {mandatory.total}. Это
                    наличие расшифровки, не подтверждение навыка.
                  </p>
                </div>
                {gapWarning ? <p className="report-gap">{gapWarning}</p> : null}
                {optionalGaps.length > 0 ? (
                  <p className="muted-copy">
                    Желательные пробелы (не провал обязательных):{" "}
                    {optionalGaps.map((row) => row.skill).join(", ")}.
                  </p>
                ) : null}
                <dl className="report-figures">
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
              </section>
            ) : null}

            {/* 4. Карта требований и ответы */}
            <section className="requirement-map" id="requirements" aria-labelledby="requirements-heading">
              <div className="requirement-map__list">
                <header>
                  <h2 id="requirements-heading">Карта требований</h2>
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
                      data-selected={row.skill === selectedSkill || (selectedSkill === null && row === selected)}
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
                        Наличие ответа: {COVERAGE_LABEL[selected.coverage]}
                      </p>
                      <p className="muted-copy">
                        {processing
                          ? "Отчёт ещё собирается — это не итог по навыку."
                          : `Заключение: ${CONCLUSION_LABEL[requirementConclusion(selected)]}`}
                      </p>
                      {!processing ? (
                        <p className="muted-copy">{analysisSourceLabel()}</p>
                      ) : null}
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

            {/* 5. Следующий шаг человека */}
            {canManage ? (
              <section className="plain-section" id="next-step" aria-labelledby="next-step-heading">
                <h2 id="next-step-heading">Следующий шаг</h2>
                <p className="muted-copy">
                  Система собирает наблюдения, решение принимает человек.
                </p>

                <h3>Уточнения</h3>
                <p className="muted-copy">
                  Доп. вопрос и аудит создаются без текста на сервере — ссылку или контекст передаёте вы.
                </p>
                <div className="form-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || hasOpenExtra}
                    onClick={() => void handleExtra()}
                  >
                    Запросить доп. ответ
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || hasOpenAudit}
                    onClick={() => void handleAudit()}
                  >
                    Запросить аудит
                  </Button>
                </div>
                {hasOpenExtra ? (
                  <p className="disabled-hint">Уже есть открытый доп. вопрос — новый не создаём.</p>
                ) : null}
                {hasOpenAudit ? (
                  <p className="disabled-hint">Уже есть открытый аудит — новый не создаём.</p>
                ) : null}
                {extras.length > 0 ? (
                  <ul className="stack-list">
                    {extras.map((item) => (
                      <li key={item.id}>
                        Доп. вопрос: {clarificationStatusLabel(item.status)} ·{" "}
                        {extraLink(interview.access_token, item.id)}
                        {isClarificationOpen(item.status)
                          ? " · отправьте ссылку кандидату самостоятельно"
                          : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {audits.length > 0 ? (
                  <ul className="stack-list">
                    {audits.map((item) => (
                      <li key={item.id}>
                        Аудит эксперта: {clarificationStatusLabel(item.status)}
                        {item.close_reason ? ` · закрыт: ${item.close_reason}` : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {openItems.length > 0 ? (
                  <div>
                    {openItems.map((item) => (
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

                <h3>Решение</h3>
                <p className="muted-copy">
                  Передача менеджеру открывает ему карточку и ваш комментарий. Запрос мнения — только доступ к
                  отчёту, без передачи кандидата.
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
                  <p className="disabled-hint">
                    Передача недоступна:{" "}
                    {openItems
                      .map((item) =>
                        item.type === "extra" ? "открыт доп. вопрос" : "открыт аудит эксперта",
                      )
                      .join(", ")}
                    . Сначала закройте уточнения.
                  </p>
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
