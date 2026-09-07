"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SkeletonText } from "@/components/ui/skeleton";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import type {
  Interview,
  InterviewEventRecord,
  InterviewEventsResponse,
  PerQuestionReport,
  SkillClass,
  StaffManager,
  VacancyDetail,
} from "@/lib/api";
import {
  grantManagedOpinion,
  handoffManagedInterview,
  loadHiringManagers,
  loadInterview,
  loadInterviewEvents,
  loadVacancy,
  reevaluateManagedInterview,
  rejectManagedInterview,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { useToast } from "@/lib/toast";
import { interviewMark } from "@/lib/pipeline";
import {
  buildRequirementMap,
  COVERAGE_LABEL,
  DIFFICULTY_LABEL,
  isReportProcessing,
  scoreTone,
  skillVerdictFor,
  uncoveredRequirements,
  vacancyScoreRange,
  type RequirementCoverage,
} from "@/lib/report";
import { buildNav, vacancyBreadcrumbs } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";
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
  fits: "Проходит",
  not_fits: "Не проходит",
  needs_review: "Нуждается в доп. проверке",
};

function verdictTone(verdict: string | null | undefined): StatusTone {
  if (verdict === "fits") return "positive";
  if (verdict === "not_fits") return "danger";
  if (verdict === "needs_review") return "warning";
  return "neutral";
}

function verdictLabel(verdict: string | null | undefined): string {
  if (verdict === "fits" || verdict === "not_fits" || verdict === "needs_review") {
    return VERDICT_LABEL[verdict];
  }
  return "Вердикт";
}

/** Очковые суммы отчёта — float: целые как есть, дробные до сотых (5.3333… -> 5.33). */
function formatPoints(value: number | null | undefined): string | null {
  if (value == null) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
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

function skillLevelTone(level: number): "positive" | "warning" | "danger" {
  if (level >= 3) return "positive";
  if (level >= 1) return "warning";
  return "danger";
}

function skillLevel(report: Interview["report_json"], skill: string): number | null {
  return report?.skill_levels?.find((item) => item.skill_tag.trim().toLowerCase() === skill.trim().toLowerCase())?.level ?? null;
}

function hasSkillMatrix(report: Interview["report_json"]): boolean {
  return Boolean(report?.skill_levels?.length);
}

/** Средний уровень по навыкам вопроса — то, что уходит в question_score. */
function questionAverageScore(row: PerQuestionReport): number | null {
  const scores = row.skill_scores;
  if (!Array.isArray(scores) || scores.length === 0) {
    return typeof row.score === "number" ? row.score : null;
  }
  return scores.reduce((sum, entry) => sum + entry.score, 0) / scores.length;
}

const SECURITY_SIGNAL_LABEL: Record<string, string> = {
  "security:tab_hidden": "Свернул вкладку/окно",
  "security:tab_visible": "Вернулся во вкладку",
  "security:camera_muted": "Камера пропала",
  "security:camera_unmuted": "Камера снова активна",
};

/** Полезная нагрузка события: API отдаёт конверт {ts, type, payload}, текст — во вложенном payload. */
function eventPayload(row: InterviewEventRecord): Record<string, unknown> {
  const inner = row.payload["payload"];
  return (inner && typeof inner === "object" ? inner : row.payload) as Record<string, unknown>;
}

type ProtocolSpeaker = "question" | "agent" | "candidate";

const PROTOCOL_SPEAKER_LABEL: Record<ProtocolSpeaker, string> = {
  question: "Вопрос",
  agent: "Интервьюер (ИИ)",
  candidate: "Кандидат",
};

function pluralReplicas(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "реплик";
  const mod10 = count % 10;
  if (mod10 === 1) return "реплика";
  if (mod10 >= 2 && mod10 <= 4) return "реплики";
  return "реплик";
}

function securitySignalLabel(eventType: string): string {
  return SECURITY_SIGNAL_LABEL[eventType] ?? eventType.replace("security:", "");
}

export default function VacancyCandidatePage() {
  const params = useParams<{ id: string; cid: string }>();
  const { landing, loading } = useProtectedLanding();
  const canManage = landing?.available_areas.some((area) => area.id === RECRUITER_AREA) ?? false;

  const [interview, setInterview] = useState<Interview | null>(null);
  const [events, setEvents] = useState<InterviewEventsResponse | null>(null);
  const [managers, setManagers] = useState<StaffManager[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [managerId, setManagerId] = useState("");
  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [focusedLineKey, setFocusedLineKey] = useState<string | null>(null);
  const [openSkillsOverride, setOpenSkillsOverride] = useState<string[] | null>(null);
  const [openQuestions, setOpenQuestions] = useState<string[]>([]);
  const [finalInviteOpen, setFinalInviteOpen] = useState(false);
  const [finalInviteCopied, setFinalInviteCopied] = useState(false);

  const requirements = useMemo(
    () => (vacancy ? buildRequirementMap(vacancy, vacancy.questions, events?.answers ?? []) : []),
    [events, vacancy],
  );
  // В шкалу входят только оцениваемые вопросы: warmup/closing без skill_tag дают 0 баллов
  // и в знаменатель не идут (8 из 9, а не 8 из 12).
  const assessedQuestionCount = useMemo(
    () => (vacancy?.questions ?? []).filter((question) => question.role === "assessment").length,
    [vacancy],
  );
  const assessedQuestions = useMemo(
    () =>
      (vacancy?.questions ?? [])
        .filter((question) => question.role === "assessment")
        .sort((a, b) => a.order - b.order),
    [vacancy],
  );
  const questionReports = useMemo(
    () => new Map((interview?.report_json?.per_question ?? []).map((row) => [row.question_id, row])),
    [interview],
  );
  const uncovered = useMemo(() => uncoveredRequirements(requirements), [requirements]);
  // Раскладка шкалы на сегменты метра: вопросы / обязательные / желательные навыки.
  const scoreBreakdown = useMemo(() => {
    const report = interview?.report_json;
    if (!report || !report.max_score) return null;
    const qMax = assessedQuestionCount * 3;
    let reqMax = 0;
    let reqPts = 0;
    let niceMax = 0;
    let nicePts = 0;
    for (const row of requirements) {
      const level = skillLevel(report, row.skill);
      if (level == null) continue;
      if (row.mandatory) {
        reqMax += 2;
        reqPts += (level / 3) * 2;
      } else {
        niceMax += 0.5;
        nicePts += (level / 3) * 0.5;
      }
    }
    return {
      qMax,
      qPts: report.question_score ?? 0,
      reqMax,
      reqPts,
      niceMax,
      nicePts,
      total: qMax + reqMax + niceMax,
    };
  }, [interview, requirements, assessedQuestionCount]);
  const vacancyScale = vacancy ? vacancyScoreRange(vacancy, assessedQuestionCount) : null;
  const processing = interview ? isReportProcessing(interview) : false;
  // По умолчанию раскрыто первое требование — деталь видна сразу, как в старой панели.
  const defaultOpenSkills = useMemo(() => (requirements[0] ? [requirements[0].skill] : []), [requirements]);
  const openSkills = openSkillsOverride ?? defaultOpenSkills;

  function toggleSkillRow(skill: string) {
    setOpenSkillsOverride(
      openSkills.includes(skill)
        ? openSkills.filter((item) => item !== skill)
        : [...openSkills, skill],
    );
  }

  function toggleQuestionRow(questionId: string) {
    setOpenQuestions((current) =>
      current.includes(questionId)
        ? current.filter((item) => item !== questionId)
        : [...current, questionId],
    );
  }
  const securitySignals = useMemo(
    () => (events?.events ?? []).filter((row) => row.event_type.startsWith("security:")),
    [events],
  );

  // Протокол встречи: вопросы по question_started (agent_utterance дублирует их),
  // реплики агента — только вне вопросов (адаптивные вставки, завершение).
  const protocolLines = useMemo(() => {
    const lines: Array<{ key: string; speaker: ProtocolSpeaker; text: string }> = [];
    for (const row of events?.events ?? []) {
      const text = eventPayload(row)["text"];
      if (typeof text !== "string" || !text.trim()) continue;
      if (row.event_type === "question_started") {
        lines.push({ key: row.id, speaker: "question", text: text.trim() });
      } else if (row.event_type === "candidate_utterance") {
        lines.push({ key: row.id, speaker: "candidate", text: text.trim() });
      } else if (row.event_type === "agent_utterance" && eventPayload(row)["kind"] !== "question") {
        lines.push({ key: row.id, speaker: "agent", text: text.trim() });
      }
    }
    return lines;
  }, [events]);

  const transcriptNeedle = transcriptQuery.trim().toLowerCase();
  const visibleProtocolLines = transcriptNeedle
    ? protocolLines.filter((line) => line.text.toLowerCase().includes(transcriptNeedle))
    : protocolLines;

  // Клик по найденной реплике: сбрасываем фильтр и прыгаем к ней в полном протоколе.
  function focusProtocolLine(key: string) {
    if (!transcriptNeedle) return;
    setTranscriptQuery("");
    setFocusedLineKey(key);
  }

  useEffect(() => {
    if (!focusedLineKey) return;
    const element = document.getElementById(`protocol-line-${focusedLineKey}`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setFocusedLineKey(null), 3000);
    return () => clearTimeout(timer);
  }, [focusedLineKey]);

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
        const [managerResponse, eventsPayload, vacancyDetail] = await Promise.all([
          canManage ? loadHiringManagers() : Promise.resolve({ items: [] as StaffManager[] }),
          loadInterviewEvents(params.cid).catch(() => null),
          loadVacancy(params.id).catch(() => null),
        ]);
        if (cancelled) {
          return;
        }
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

  const { pushToast } = useToast();

  async function handleHandoff() {
    if (!managerId.trim()) {
      pushToast("warning", "Выберите менеджера.");
      return;
    }
    setBusy(true);
    const manager = managers.find((item) => item.id === managerId.trim());
    try {
      await handoffManagedInterview(params.cid, { to_manager_id: managerId.trim(), summary: "" });
      setInterview((current) =>
        current
          ? {
              ...current,
              recruiter_decision: "handed_off",
              handed_off_to: manager ? { id: manager.id, name: manager.name } : null,
            }
          : current,
      );
      pushToast("success", `Передано менеджеру: ${manager?.name ?? "имя менеджера неизвестно"}`);
    } catch (caughtError) {
      const message = normalizeError(caughtError, "Не удалось передать менеджеру.");
      pushToast("error", message.includes("Already handed off") ? "Уже передано менеджеру ранее." : message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAskOpinion() {
    if (!managerId.trim()) {
      pushToast("warning", "Выберите менеджера.");
      return;
    }
    setBusy(true);
    try {
      await grantManagedOpinion(params.cid, managerId.trim());
      setInterview((current) =>
        current ? { ...current, recruiter_decision: "opinion_asked" } : current,
      );
      pushToast("success", "Запросили мнение менеджера.");
    } catch (caughtError) {
      pushToast("error", normalizeError(caughtError, "Не удалось запросить мнение."));
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!window.confirm("Отметить кандидата как «Не прошёл»?")) {
      return;
    }
    setBusy(true);
    try {
      await rejectManagedInterview(params.cid);
      setInterview((current) => (current ? { ...current, recruiter_decision: "rejected" } : current));
      pushToast("success", "Кандидат отмечен как не прошедший.");
    } catch (caughtError) {
      pushToast("error", normalizeError(caughtError, "Не удалось отметить кандидата."));
    } finally {
      setBusy(false);
    }
  }

  function finalInviteMessage(): string {
    const name = interview?.candidate_name ? `, ${interview.candidate_name}` : "";
    const title = vacancy ? ` на позицию «${vacancy.title}»` : "";
    return `Здравствуйте${name}! Приглашаем вас на финальное интервью${title}. Рекрутер свяжется с вами, чтобы согласовать удобное время.`;
  }

  async function copyFinalInviteMessage() {
    try {
      await navigator.clipboard?.writeText(finalInviteMessage());
      setFinalInviteCopied(true);
      setTimeout(() => setFinalInviteCopied(false), 1500);
    } catch {
      // Текст остаётся доступен для ручного копирования.
    }
  }

  async function handleReevaluate() {
    setBusy(true);
    try {
      const updated = await reevaluateManagedInterview(params.cid);
      setInterview(updated);
      if (updated.product_state === "report_processing") {
        // Ожидаемый ответ: разбор асинхронный — задача сброшена в очередь evaluation-agent.
        pushToast("success", "Пересборка отчёта запущена — отчёт появится через пару минут.");
      } else if (updated.product_state === "report_ready") {
        pushToast("success", "Отчёт пересобран.");
      } else {
        pushToast("warning", "Не удалось запустить пересборку отчёта. Попробуйте позже.");
      }
    } catch (caughtError) {
      pushToast("error", normalizeError(caughtError, "Не удалось пересобрать отчёт."));
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
      <div className={canManage ? "workspace workspace--with-deck" : "workspace"}>
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
              description={
                <StatusPill tone={interviewMark(interview).tone}>{interviewMark(interview).label}</StatusPill>
              }
            />
            {error ? <p className="form-error">{error}</p> : null}

            {interview.recording_url && !processing ? (
              <section className="interview-recording">
                <h2>Запись интервью</h2>
                <video controls src={interview.recording_url} />
              </section>
            ) : null}

            <section className="report-hero">
              <div className="report-hero__top">
                <div className="report-hero__main">
                  <div className="report-hero__title">
                    {interview.report_json ? (
                      <>
                        <span className="report-hero__eyebrow">Результат скрининга</span>
                        <span
                          className="report-hero__verdict"
                          data-tone={verdictTone(interview.report_json.verdict)}
                        >
                          <i />
                          {verdictLabel(interview.report_json.verdict)}
                        </span>
                      </>
                    ) : (
                      <h2>Что видно из ответов</h2>
                    )}
                  </div>
                  <p className="report-hero__note">
                    Это разбор ответов системой, а не решение о найме.{" "}
                    {processing ? "Интервью завершено, отчёт собирается." : reportLabel(interview)}
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
                </div>
                {!processing && interview.report_json ? (
                  <div className="report-hero__score">
                    <span className="report-hero__percent">
                      {interview.report_json.score_percent ?? interview.report_json.overall_score ?? "—"}
                      <small>%</small>
                    </span>
                    <span className="report-hero__points">
                      {formatPoints(
                        (interview.report_json.question_score ?? 0) + (interview.report_json.skill_score ?? 0),
                      )}{" "}
                      из {formatPoints(interview.report_json.max_score) ?? "—"}
                    </span>
                    <span className="muted-copy">совместимость с вакансией</span>
                    {interview.report_json.generated_at ? (
                      <span className="report-hero__meta">
                        {new Date(interview.report_json.generated_at).toLocaleString("ru-RU")}
                        {interview.report_json.model_version
                          ? ` · ${interview.report_json.model_version}`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {!processing && interview.report_json && scoreBreakdown ? (
                <div className="score-meter">
                  <div className="score-meter__bar">
                    <div
                      className="score-meter__fill"
                      style={{
                        width: `${Math.min(100, interview.report_json.score_percent ?? interview.report_json.overall_score ?? 0)}%`,
                      }}
                    />
                    <span className="score-meter__threshold" />
                  </div>
                  <div className="score-meter__legend">
                    <div>
                      <small>Вопросы</small>
                      <b>
                        {formatPoints(scoreBreakdown.qPts)} / {formatPoints(scoreBreakdown.qMax)}
                      </b>
                    </div>
                    {scoreBreakdown.reqMax > 0 ? (
                      <div>
                        <small>Обязательные навыки</small>
                        <b>
                          {formatPoints(scoreBreakdown.reqPts)} / {formatPoints(scoreBreakdown.reqMax)}
                        </b>
                      </div>
                    ) : null}
                    {scoreBreakdown.niceMax > 0 ? (
                      <div>
                        <small>Желательные навыки</small>
                        <b>
                          {formatPoints(scoreBreakdown.nicePts)} / {formatPoints(scoreBreakdown.niceMax)}
                        </b>
                      </div>
                    ) : null}
                  </div>
                  {vacancy && vacancyScale ? (
                    <details className="score-meter__formula">
                      <summary>Как считается совместимость</summary>
                      <div className="score-meter__formula-body">
                        <div>
                          <code>{assessedQuestionCount} вопросов × 3 = {formatPoints(scoreBreakdown.qMax)}</code> ·{" "}
                          <code>
                            {vacancy.required_skills.length} обязательных × 2 ={" "}
                            {formatPoints(vacancy.required_skills.length * 2)}
                          </code>{" "}
                          ·{" "}
                          <code>
                            {vacancy.nice_to_have_skills.length} желательных × 0.5 ={" "}
                            {formatPoints(vacancy.nice_to_have_skills.length * 0.5)}
                          </code>{" "}
                          → максимум <code>{formatPoints(vacancyScale.maximum)}</code>
                        </div>
                        <div>
                          Навык оценивается уровнем 0–3 и переводится в баллы как{" "}
                          <code>уровень ÷ 3 × вес</code>: обязательный навык даёт до 2.00, желательный — до
                          0.50. Вопрос даёт средний уровень по своим навыкам (максимум 3).
                        </div>
                        <div>
                          Порог найма — 60% от максимума: <code>{formatPoints(scoreBreakdown.total * 0.6)}</code>{" "}
                          балла из {formatPoints(scoreBreakdown.total)}.
                        </div>
                        {scoreBreakdown.total < vacancyScale.maximum ? (
                          <div>
                            Максимум пересчитан с {formatPoints(vacancyScale.maximum)} на{" "}
                            {formatPoints(scoreBreakdown.total)}:{" "}
                            {uncovered.length > 0
                              ? `«${uncovered.map((row) => row.skill).join("», «")}» не ${
                                  uncovered.length === 1 ? "закрыто" : "закрыты"
                                } вопросами и исключено из шкалы — иначе кандидат терял бы баллы за дыру в калибровке.`
                              : "часть требований осталась без оценок и исключена из шкалы."}
                          </div>
                        ) : null}
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="skill-matrix">
              <div className="skill-matrix__head">
                <h2>Матрица компетенций</h2>
                <span className="muted-copy">
                  {processing
                    ? "Расшифровки ещё могут появиться — это не итоговый пробел"
                    : "Нажмите на строку, чтобы раскрыть ответ и обоснование"}
                </span>
              </div>
              {requirements.length === 0 ? (
                <p className="muted-copy" style={{ padding: "16px 20px" }}>
                  У вакансии не заполнены требования, сопоставлять нечего.
                </p>
              ) : (
                <div className="skill-matrix__rows">
                  {requirements.map((row) => {
                    const sv = processing ? null : skillVerdictFor(interview.report_json, row.skill, row.questions);
                    const level = processing
                      ? null
                      : (skillLevel(interview.report_json, row.skill) ?? sv?.best_score ?? null);
                    const weight = row.mandatory ? 2 : 0.5;
                    const points = level != null ? (level / 3) * weight : null;
                    const open = openSkills.includes(row.skill);
                    return (
                      <div
                        className="sm-row"
                        key={row.skill}
                        data-open={open ? "true" : "false"}
                        data-gap={row.coverage === "not-covered" ? "true" : "false"}
                      >
                        <button type="button" className="sm-row__btn" onClick={() => toggleSkillRow(row.skill)}>
                          <span className="sm-row__name">
                            <strong>{row.skill}</strong>
                            <span className="muted-copy">
                              {row.mandatory ? "Обязательное" : "Желательное"}
                              {row.questions.length > 0
                                ? ` · вес ×${weight} · вопрос ${row.questions.map((question) => question.order).join(", ")}`
                                : " · вопрос не задан"}
                            </span>
                          </span>
                          <span className="sm-row__lvl">
                            <span className="lvl" data-tone={level != null ? skillLevelTone(level) : "none"}>
                              {[0, 1, 2].map((index) => (
                                <i key={index} data-on={level != null && index < level ? "true" : "false"} />
                              ))}
                            </span>
                            <span className="lvl-cap">
                              {level != null
                                ? `Уровень ${level}/3`
                                : row.coverage === "not-covered"
                                  ? "Не проверен"
                                  : COVERAGE_LABEL[row.coverage]}
                            </span>
                          </span>
                          <span className="sm-row__pts">
                            {points != null ? formatPoints(points) : "—"}
                            <small>{points != null ? `из ${formatPoints(weight)}` : "вне шкалы"}</small>
                          </span>
                          <span className="sm-row__caret">▾</span>
                        </button>
                        {open ? (
                          <div className="sm-row__detail">
                            {(() => {
                              if (processing) {
                                return <p className="muted-copy">Отчёт ещё собирается — это не итог по навыку.</p>;
                              }
                              if (sv) {
                                return (
                                  <div className="skill-verdict">
                                    <StatusPill tone={skillClassTone(sv.skill_class)}>
                                      {SKILL_CLASS_LABEL[sv.skill_class]}
                                    </StatusPill>
                                    {sv.best_score != null ? (
                                      <p className="muted-copy">
                                        {hasSkillMatrix(interview.report_json)
                                          ? `Лучший уровень по ответу: ${sv.best_score}/3.`
                                          : `Лучший балл по навыку: ${sv.best_score}/100.`}
                                      </p>
                                    ) : null}
                                    {sv.reasoning_lines.length > 0 ? (
                                      <ul className="sm-row__reasoning">
                                        {sv.reasoning_lines.map((line, index) => (
                                          <li key={index} className="muted-copy">
                                            {line}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                );
                              }
                              return (
                                <p className="muted-copy">
                                  <StatusPill tone={coverageTone(row.coverage)}>
                                    {COVERAGE_LABEL[row.coverage]}
                                  </StatusPill>
                                </p>
                              );
                            })()}
                            {row.answers.length > 0 ? (
                              row.answers.map(({ question, answer }) => (
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
                                    const scored = interview.report_json?.per_question?.find(
                                      (item) => item.question_id === question.id,
                                    );
                                    const skillScores = scored?.skill_scores ?? [];
                                    if (!scored || skillScores.length === 0) return null;
                                    const quotes = scored.quotes ?? [];
                                    return (
                                      <div className="question-score">
                                        {skillScores.map((skillScore) => (
                                          <span
                                            key={skillScore.skill_tag}
                                            className="score-chip"
                                            data-tone={
                                              hasSkillMatrix(interview.report_json)
                                                ? skillLevelTone(skillScore.score)
                                                : scoreTone(skillScore.score)
                                            }
                                          >
                                            {skillScore.skill_tag}: {skillScore.score}/
                                            {hasSkillMatrix(interview.report_json) ? "3" : "100"}
                                          </span>
                                        ))}
                                        <span className="muted-copy">
                                          {DIFFICULTY_LABEL[question.difficulty]}
                                          {scored.answered_with_hint ? " · отвечал с подсказкой" : ""}
                                          {typeof scored.confidence === "number"
                                            ? ` · уверенность оценки ${Math.round(scored.confidence * 100)}%`
                                            : ""}
                                        </span>
                                        {scored.report ? <p className="muted-copy">{scored.report}</p> : null}
                                        {quotes.length > 0
                                          ? quotes.map((quote, index) => (
                                              <blockquote key={index}>«{quote.text}»</blockquote>
                                            ))
                                          : null}
                                        {/* Обоснования баллов не дублируем здесь: блок навыка выше
                                            уже показывает те же строки агрегированно (с номером вопроса). */}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ))
                            ) : row.coverage === "asked" ? (
                              <p className="muted-copy">
                                {processing
                                  ? "Расшифровка ещё может появиться — отчёт собирается."
                                  : `Вопрос ${row.questions.map((question) => question.order).join(", ")} задавали, но расшифровки ответа нет. Это пробел в данных, а не минус кандидату.`}
                              </p>
                            ) : (
                              <p className="muted-copy">
                                Ни один вопрос комплекта не закрывает это требование. Дыра в калибровке: её
                                стоит закрыть эксперту, а не считать ответом кандидата.
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {uncovered.length > 0 && !processing ? (
                    <div className="skill-matrix__note">
                      <span>⚠</span>
                      <span>
                        Максимум пересчитан: {uncovered.map((row) => `«${row.skill}»`).join(", ")} не{" "}
                        {uncovered.length === 1 ? "закрыто" : "закрыты"} вопросами и исключено из шкалы —
                        иначе кандидат терял бы баллы за дыру в калибровке.
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            {assessedQuestions.length > 0 ? (
              <section className="question-list">
                <div className="skill-matrix__head">
                  <h2>Ответы на вопросы</h2>
                  <span className="muted-copy">
                    {interview.report_json?.question_score != null
                      ? `${formatPoints(interview.report_json.question_score)} из ${formatPoints(assessedQuestionCount * 3)} · `
                      : ""}
                    каждый вопрос оценивается от 0 до 3
                  </span>
                </div>
                <div className="question-list__rows">
                  {assessedQuestions.map((question) => {
                    const scored = questionReports.get(question.id);
                    const score = scored ? questionAverageScore(scored) : null;
                    const open = openQuestions.includes(question.id);
                    return (
                      <div className="q-row" key={question.id} data-open={open ? "true" : "false"}>
                        <button type="button" className="q-row__btn" onClick={() => toggleQuestionRow(question.id)}>
                          <span className="q-row__num">{String(question.order).padStart(2, "0")}</span>
                          <span className="q-row__title">{question.text}</span>
                          <span className="q-row__score">
                            {score != null
                              ? [0, 1, 2].map((index) => (
                                  <i key={index} data-on={index < Math.round(score) ? "true" : "false"} />
                                ))
                              : null}
                            {score != null ? <b>{formatPoints(score)}</b> : <span className="muted-copy">—</span>}
                          </span>
                          <span className="sm-row__caret">▾</span>
                        </button>
                        {open ? (
                          <div className="q-row__detail">
                            <p>
                              {scored?.report ??
                                (processing
                                  ? "Разбор появится, когда отчёт соберётся."
                                  : "Разбор по этому вопросу не попал в отчёт.")}
                            </p>
                            {scored && (scored.quotes ?? []).length > 0
                              ? (scored.quotes ?? []).map((quote, index) => (
                                  <blockquote key={index}>«{quote.text}»</blockquote>
                                ))
                              : null}
                            <span className="muted-copy">
                              {DIFFICULTY_LABEL[question.difficulty]}
                              {scored?.answered_with_hint ? " · отвечал с подсказкой" : ""}
                              {typeof scored?.confidence === "number"
                                ? ` · уверенность оценки ${Math.round(scored.confidence * 100)}%`
                                : ""}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <details className="calib-block">
              <summary>
                <StatusPill tone={securitySignals.length > 0 ? "warning" : "positive"}>
                  {securitySignals.length > 0 ? `${securitySignals.length} техн. сигналов` : "Проверка чистая"}
                </StatusPill>
                Калибровка и достоверность
                <span className="calib-block__caret">▾</span>
              </summary>
              <div className="calib-block__body">
                <p className="calib-block__line">
                  <span className="cmark" data-tone={securitySignals.length > 0 ? "warning" : "positive"}>
                    {securitySignals.length > 0 ? "◑" : "●"}
                  </span>
                  <span>
                    <b>
                      {securitySignals.length > 0
                        ? "Есть технические сигналы."
                        : "Попыток обойти проверку не зафиксировано."}
                    </b>{" "}
                    {securitySignals.length > 0
                      ? "Что мы можем выяснить технически — не признак нарушения, просто сырые сигналы: переключал ли вкладку, пропадала ли картинка с камеры."
                      : "Подозрительных переключений вкладок и пропаданий камеры в записи нет."}
                  </span>
                </p>
                {securitySignals.map((row) => (
                  <p className="calib-block__line" key={row.id}>
                    <span className="cmark" data-tone="muted">○</span>
                    <span>
                      {securitySignalLabel(row.event_type)}{" "}
                      <time className="muted-copy" dateTime={row.created_at}>
                        {new Date(row.created_at).toLocaleString("ru-RU")}
                      </time>
                    </span>
                  </p>
                ))}
              </div>
            </details>

            {protocolLines.length > 0 ? (
              <details className="transcript-section">
                <summary>
                  <h2>Протокол встречи</h2>
                  <span className="muted-copy">
                    {protocolLines.length} {pluralReplicas(protocolLines.length)} · полная расшифровка
                  </span>
                </summary>
                <div className="transcript-tools">
                  <input
                    type="search"
                    value={transcriptQuery}
                    onChange={(event) => setTranscriptQuery(event.target.value)}
                    placeholder="Поиск по протоколу — например, «event loop»"
                  />
                  {transcriptQuery.trim() ? (
                    <span className="muted-copy">
                      {visibleProtocolLines.length === 0
                        ? "Ничего не найдено"
                        : `${visibleProtocolLines.length} из ${protocolLines.length} · клик по реплике — перейти к контексту`}
                    </span>
                  ) : null}
                </div>
                <div className="transcript-lines" data-filtered={transcriptNeedle ? "true" : "false"}>
                  {visibleProtocolLines.map((line) => (
                    <p
                      key={line.key}
                      id={`protocol-line-${line.key}`}
                      className="transcript-line"
                      data-speaker={line.speaker}
                      data-focused={focusedLineKey === line.key ? "true" : "false"}
                      onClick={transcriptNeedle ? () => focusProtocolLine(line.key) : undefined}
                    >
                      <strong>{PROTOCOL_SPEAKER_LABEL[line.speaker]}</strong>
                      <span>{line.text}</span>
                    </p>
                  ))}
                  {visibleProtocolLines.length === 0 ? (
                    <p className="muted-copy">По запросу «{transcriptQuery.trim()}» ничего не найдено.</p>
                  ) : null}
                </div>
              </details>
            ) : null}

            {canManage ? (
              <div className="decision-deck">
              <div className="decision-deck__in">
                {interview.recruiter_decision === "handed_off" && interview.handed_off_to ? (
                  <>
                    <span className="decision-deck__label">Заявка у менеджера</span>
                    <span className="decision-deck__manager">{interview.handed_off_to.name}</span>
                    <span className="decision-deck__spacer" />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled
                      title="Кнопка станет доступна после решения менеджера"
                      onClick={() => setFinalInviteOpen(true)}
                    >
                      Пригласить на финал
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="decision-deck__label">Решение по кандидату</span>
                    <select
                      value={managerId}
                      onChange={(event) => setManagerId(event.target.value)}
                      aria-label="Менеджер"
                    >
                      <option value="">Выберите менеджера</option>
                      {managers.map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {manager.name} ({manager.email})
                        </option>
                      ))}
                    </select>
                    <span className="decision-deck__spacer" />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={interview.recruiter_decision !== "awaiting"}
                      onClick={() => setFinalInviteOpen(true)}
                    >
                      Пригласить на финал
                    </Button>
                    <Button
                      type="button"
                      disabled={
                        busy ||
                        !managerId.trim() ||
                        (interview.recruiter_decision != null &&
                          interview.recruiter_decision !== "awaiting" &&
                          interview.recruiter_decision !== "opinion_asked")
                      }
                      onClick={() => void handleHandoff()}
                    >
                      Передать менеджеру
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        busy ||
                        !managerId.trim() ||
                        Boolean(interview.recruiter_decision && interview.recruiter_decision !== "awaiting")
                      }
                      onClick={() => void handleAskOpinion()}
                    >
                      Спросить мнение
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        busy ||
                        (interview.recruiter_decision != null &&
                          interview.recruiter_decision !== "awaiting" &&
                          interview.recruiter_decision !== "opinion_asked")
                      }
                      onClick={() => void handleReject()}
                    >
                      Не продолжаем
                    </Button>
                  </>
                )}
              </div>
              </div>
            ) : null}
            <Modal open={finalInviteOpen} title="Приглашение на финальное интервью" onClose={() => setFinalInviteOpen(false)}>
              <div className="form-surface">
                <div className="invite-message" aria-label="Сообщение для кандидата">
                  <button type="button" className="invite-message__copy" aria-label="Скопировать сообщение" onClick={() => void copyFinalInviteMessage()}>
                    {finalInviteCopied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                  <pre>{finalInviteMessage()}</pre>
                </div>
              </div>
            </Modal>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
