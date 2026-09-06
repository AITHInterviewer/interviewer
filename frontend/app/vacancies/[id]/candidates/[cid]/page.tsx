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
  SkillClass,
  StaffManager,
  VacancyDetail,
} from "@/lib/api";
import {
  handoffManagedInterview,
  loadHiringManagers,
  loadInterview,
  loadInterviewEvents,
  loadVacancy,
  reevaluateManagedInterview,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { interviewStageLabel } from "@/lib/pipeline";
import {
  buildRequirementMap,
  CONCLUSION_LABEL,
  COVERAGE_LABEL,
  DIFFICULTY_LABEL,
  isReportProcessing,
  requirementConclusion,
  requiredSkillTally,
  scoreTone,
  skillVerdictFor,
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

function verdictTone(verdict: "fits" | "not_fits" | "needs_review"): StatusTone {
  if (verdict === "fits") return "positive";
  if (verdict === "not_fits") return "danger";
  return "warning";
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
  const [status, setStatus] = useState<string | null>(null);
  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [focusedLineKey, setFocusedLineKey] = useState<string | null>(null);
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
  const selected =
    requirements.find((row) => row.skill === selectedSkill) ?? requirements[0] ?? null;
  const processing = interview ? isReportProcessing(interview) : false;
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

  async function handleHandoff() {
    if (!managerId.trim()) {
      setError("Выберите менеджера.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await handoffManagedInterview(params.cid, { to_manager_id: managerId.trim(), summary: "" });
      setInterview((current) => (current ? { ...current, recruiter_decision: "handed_off" } : current));
      setStatus("Передано менеджеру.");
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось передать менеджеру."));
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
                    const report = interview.report_json;
                    const normalize = (value: string) => value.trim().toLowerCase();
                    const confirmed = report.confirmed_skills;
                    const unconfirmed = report.unconfirmed_skills;
                    // Оценён, но не классифицирован (между подтверждено/не подтверждено) —
                    // по агентской шкале это «требует проверки».
                    const seen = new Set([...confirmed.map(normalize), ...unconfirmed.map(normalize)]);
                    const ambiguous: string[] = [];
                    for (const tag of report.per_question.flatMap((row) =>
                      row.skill_scores.map((entry) => entry.skill_tag),
                    )) {
                      const key = normalize(tag);
                      if (!seen.has(key)) {
                        seen.add(key);
                        ambiguous.push(tag);
                      }
                    }
                    const groups = [
                      { label: "Подтверждено", tone: "positive" as const, skills: confirmed },
                      { label: "Требует проверки", tone: "warning" as const, skills: ambiguous },
                      { label: "Не подтверждено", tone: "danger" as const, skills: unconfirmed },
                    ];
                    if (groups.every((group) => group.skills.length === 0)) return null;
                    return (
                      <div className="skill-chips">
                        {groups.map((group) =>
                          group.skills.length > 0 ? (
                            <div key={group.label} className="skill-chips__group">
                              <span className="muted-copy">{group.label}</span>
                              {group.skills.map((skill) => (
                                <span key={skill} className="score-chip" data-tone={group.tone}>
                                  {skill}
                                </span>
                              ))}
                            </div>
                          ) : null,
                        )}
                      </div>
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
              {processing ? null : (
                <dl className="report-figures">
                  <div>
                    <dt>Баллы за вопросы</dt>
                    <dd>{formatPoints(interview.report_json?.question_score) ?? "—"} из {assessedQuestionCount * 3}</dd>
                  </div>
                  <div>
                    <dt>Баллы за навыки</dt>
                    <dd>
                      {formatPoints(interview.report_json?.skill_score) ?? "—"} из{" "}
                      {interview.report_json?.max_score != null && interview.report_json?.question_score != null
                        ? formatPoints(interview.report_json.max_score - assessedQuestionCount * 3)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Совместимость с вакансией</dt>
                    <dd>{interview.report_json?.score_percent ?? interview.report_json?.overall_score ?? "—"}%</dd>
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
              <details className="security-block">
                <summary>Безопасность: {securitySignals.length} технических сигнала</summary>
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
              </details>
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
                            {skillLevel(interview.report_json, row.skill) != null ? (
                              <span className="score-chip" data-tone={skillLevelTone(skillLevel(interview.report_json, row.skill)!)}>
                                Уровень {skillLevel(interview.report_json, row.skill)}/3
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
                              <p className="muted-copy">
                                {hasSkillMatrix(interview.report_json)
                                  ? `Лучший уровень по ответу: ${sv.best_score}/3.`
                                  : `Лучший балл по навыку: ${sv.best_score}/100.`}
                              </p>
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
                                    data-tone={hasSkillMatrix(interview.report_json) ? skillLevelTone(skillScore.score) : scoreTone(skillScore.score)}
                                  >
                                    {skillScore.skill_tag}: {skillScore.score}/{hasSkillMatrix(interview.report_json) ? "3" : "100"}
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
              <section className="plain-section">
                <h2>Решение</h2>
                <p className="muted-copy">
                  Решение основывается на пороге 60% от максимального балла вакансии.
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
                </div>
                <div className="form-actions">
                  <Button type="button" disabled={busy} onClick={() => void handleHandoff()}>
                    Передать менеджеру
                  </Button>
                  <Button type="button" variant="secondary" disabled={interview.recruiter_decision !== "awaiting"} onClick={() => setFinalInviteOpen(true)}>
                    Пригласить на финальное интервью
                  </Button>
                </div>
              </section>
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
