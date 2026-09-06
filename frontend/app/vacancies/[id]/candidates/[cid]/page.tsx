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
  SkillClass,
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
  reevaluateManagedInterview,
  requestManagedAudit,
  requestManagedExtra,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { interviewStageLabel } from "@/lib/pipeline";
import {
  buildRequirementMap,
  CONCLUSION_LABEL,
  COVERAGE_LABEL,
  DIFFICULTY_LABEL,
  isReportProcessing,
  mandatorySummary,
  requirementConclusion,
  requiredSkillTally,
  scoreTone,
  skillVerdictFor,
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
  if (verdict === "fits") return "positive";
  if (verdict === "not_fits") return "danger";
  return "warning";
}

const SKILL_CLASS_LABEL: Record<SkillClass, string> = {
  pass: "Подтверждён",
  fail: "Не подтверждён",
  ambiguous: "Требует проверки",
  untested: "Не проверен",
};

function skillClassTone(skillClass: SkillClass): StatusTone {
  if (skillClass === "pass") return "positive";
  if (skillClass === "fail") return "danger";
  if (skillClass === "ambiguous") return "warning";
  return "unchecked";
}

const SECURITY_SIGNAL_LABEL: Record<string, string> = {
  "security:tab_hidden": "Свернул вкладку/окно",
  "security:tab_visible": "Вернулся во вкладку",
  "security:camera_muted": "Камера пропала",
  "security:camera_unmuted": "Камера снова активна",
};

function securitySignalLabel(eventType: string): string {
  return SECURITY_SIGNAL_LABEL[eventType] ?? eventType.replace("security:", "");
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
  const securitySignals = useMemo(
    () => (events?.events ?? []).filter((row) => row.event_type.startsWith("security:")),
    [events],
  );

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

  async function handleReevaluate() {
    setBusy(true);
    setError(null);
    try {
      const updated = await reevaluateManagedInterview(params.cid);
      setInterview(updated);
      if (updated.product_state === "report_ready") {
        setStatus("Отчёт пересобран.");
      } else {
        setStatus("Не удалось пересобрать отчёт — разбор снова не прошёл. Попробуйте ещё раз позже.");
      }
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось пересобрать отчёт."));
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

            {interview.recording_url && !processing ? (
              <section className="interview-recording">
                <h2>Запись интервью</h2>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption -- расшифровка уже есть текстом ниже, отдельных субтитров к видео нет */}
                <video controls src={interview.recording_url} />
              </section>
            ) : null}

            <section className="report-summary">
              <div>
                <h2>
                  Что видно из ответов
                  {interview.report_json ? (
                    <StatusPill tone={verdictTone(interview.report_json.verdict)}>
                      {VERDICT_LABEL[interview.report_json.verdict]}
                    </StatusPill>
                  ) : null}
                  {interview.report_json?.overall_score != null ? (
                    <span className="score-chip" data-tone={scoreTone(interview.report_json.overall_score)}>
                      {interview.report_json.overall_score}/100
                    </span>
                  ) : null}
                </h2>
                <p className="muted-copy">
                  {processing
                    ? "Интервью завершено, отчёт собирается"
                    : `Это разбор ответов системой, а не решение о найме. ${reportLabel(interview)}`}
                </p>
                {processing && canManage ? (
                  <div className="form-actions">
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => void handleReevaluate()}>
                      Пересобрать отчёт
                    </Button>
                    <span className="muted-copy">
                      Если отчёт долго не готов — разбор мог не пройти. Кнопка запускает его заново.
                    </span>
                  </div>
                ) : null}
                {!processing && interview.report_json ? (
                  (() => {
                    const tally = requiredSkillTally(
                      interview.report_json,
                      requirements.filter((row) => row.mandatory).map((row) => row.skill),
                    );
                    if (tally.total === 0) return null;
                    return (
                      <ul className="score-tally">
                        <li data-tone="positive">
                          <strong>{tally.pass}</strong> подтверждено
                        </li>
                        <li data-tone="warning">
                          <strong>{tally.ambiguous}</strong> требует проверки
                        </li>
                        <li data-tone="danger">
                          <strong>{tally.fail}</strong> не подтверждено
                        </li>
                        {tally.untested > 0 ? (
                          <li data-tone="neutral">
                            <strong>{tally.untested}</strong> не проверено
                          </li>
                        ) : null}
                      </ul>
                    );
                  })()
                ) : null}
                {!processing && interview.report_json ? (
                  (() => {
                    const lines = [...interview.report_json.strengths, ...interview.report_json.risks];
                    if (lines.length === 0) return null;
                    return (
                      <ul className="verdict-reasoning">
                        {lines.map((line, index) => (
                          <li key={index}>{line}</li>
                        ))}
                      </ul>
                    );
                  })()
                ) : null}
                {!processing &&
                interview.report_json &&
                (interview.report_json.summary_intro || interview.report_json.summary_conclusion) ? (
                  <dl className="report-narrative">
                    {interview.report_json.summary_intro ? (
                      <div>
                        <dt>Итог</dt>
                        <dd>{interview.report_json.summary_intro}</dd>
                      </div>
                    ) : null}
                    {interview.report_json.summary_conclusion ? (
                      <div>
                        <dt>Вывод</dt>
                        <dd>{interview.report_json.summary_conclusion}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
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
                  {interview.report_json ? (
                    <div>
                      <dt>Отчёт сформирован</dt>
                      <dd>
                        {interview.report_json.generated_at
                          ? new Date(interview.report_json.generated_at).toLocaleString("ru-RU")
                          : "время не указано"}
                        <span className="muted-copy"> · модель {interview.report_json.model_version ?? "—"}</span>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              )}
            </section>

            {securitySignals.length > 0 ? (
              <section className="security-block">
                <h2>Безопасность</h2>
                <p className="muted-copy">
                  Что мы можем выяснить технически — не признак нарушения, просто сырые сигналы:
                  переключал ли вкладку, пропадала ли картинка с камеры.
                </p>
                <ul className="security-block__list">
                  {securitySignals.map((row) => (
                    <li key={row.id}>
                      <span>{securitySignalLabel(row.event_type)}</span>
                      <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString("ru-RU")}</time>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

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
                      {(() => {
                        const sv = processing ? null : skillVerdictFor(interview.report_json, row.skill);
                        if (!sv) {
                          return (
                            <StatusPill tone={coverageTone(row.coverage)}>
                              {COVERAGE_LABEL[row.coverage]}
                            </StatusPill>
                          );
                        }
                        return (
                          <span className="requirement-row__verdict">
                            {sv.best_score != null ? (
                              <span className="score-chip" data-tone={scoreTone(sv.best_score)}>
                                {sv.best_score}/100
                              </span>
                            ) : null}
                            <StatusPill tone={skillClassTone(sv.skill_class)}>
                              {SKILL_CLASS_LABEL[sv.skill_class]}
                            </StatusPill>
                          </span>
                        );
                      })()}
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
                      {(() => {
                        if (processing) return null;
                        const sv = skillVerdictFor(interview.report_json, selected.skill, selected.questions);
                        if (!sv) return null;
                        return (
                          <div className="skill-verdict">
                            <StatusPill tone={skillClassTone(sv.skill_class)}>
                              {SKILL_CLASS_LABEL[sv.skill_class]}
                            </StatusPill>
                            {sv.best_score != null ? (
                              <p className="muted-copy">Лучший балл по навыку: {sv.best_score}/100.</p>
                            ) : null}
                            {sv.reasoning_lines.length > 0 ? (
                              <ul>
                                {sv.reasoning_lines.map((line, index) => (
                                  <li key={index} className="muted-copy">
                                    {line}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        );
                      })()}
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
                            if (!scored || scored.skill_scores.length === 0) return null;
                            return (
                              <div className="question-score">
                                {scored.skill_scores.map((skillScore) => (
                                  <span
                                    key={skillScore.skill_tag}
                                    className="score-chip"
                                    data-tone={scoreTone(skillScore.score)}
                                  >
                                    {skillScore.skill_tag}: {skillScore.score}/100
                                  </span>
                                ))}
                                <span className="muted-copy">
                                  {DIFFICULTY_LABEL[question.difficulty]}
                                  {scored.answered_with_hint ? " · отвечал с подсказкой" : ""}
                                  {" · уверенность оценки "}
                                  {Math.round(scored.confidence * 100)}%
                                </span>
                                {scored.report ? <p className="muted-copy">{scored.report}</p> : null}
                                {scored.quotes.length > 0
                                  ? scored.quotes.map((quote, index) => (
                                      <blockquote key={index}>«{quote.text}»</blockquote>
                                    ))
                                  : null}
                                {/* Обоснования баллов не дублируем здесь: панель навыка выше
                                    уже показывает те же строки агрегированно (с номером вопроса). */}
                              </div>
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
