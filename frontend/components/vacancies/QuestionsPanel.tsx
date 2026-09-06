"use client";

import { ArrowsClockwise, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { SkillTagInput } from "@/components/chrome/SkillTagInput";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/overlay";
import type { Question, QuestionFormat, QuestionInput, VacancyStatus } from "@/lib/api";
import {
  addManagedQuestion,
  approveManagedVacancy,
  deleteManagedQuestion,
  regenerateManagedQuestion,
  sendManagedVacancyToExpert,
  updateManagedQuestion,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { QUESTION_FORMAT_LABEL } from "@/lib/pipeline";
import { useToast } from "@/lib/toast";

const SENDABLE_STATUSES = new Set<VacancyStatus>(["draft", "extracted", "changes_requested"]);
const APPROVABLE_STATUSES = new Set<VacancyStatus>(["calibration", "pending_review"]);

const BLANK_QUESTION_TEXT = "Новый вопрос — заполните текст или перегенерируйте";
const QUESTION_FORMATS: QuestionFormat[] = ["voice", "code_review_verbal", "live_coding"];

function sortByOrder(questions: Question[]): Question[] {
  return [...questions].sort((a, b) => a.order - b.order);
}

export function QuestionsPanel({
  vacancyId,
  vacancyStatus,
  requiredSkills,
  questions,
  canManage,
  canEditContent,
  generating,
  onGenerate,
  onQuestionsChanged,
}: {
  vacancyId: string;
  vacancyStatus: VacancyStatus;
  requiredSkills: string[];
  questions: Question[];
  /** Может генерировать/добавлять/удалять/перегенерировать вопросы (рекрутёр). */
  canManage: boolean;
  /** Может редактировать содержимое вопроса — текст/ответ/навыки/время (эксперт). */
  canEditContent: boolean;
  generating: boolean;
  onGenerate: () => void;
  onQuestionsChanged: () => Promise<void>;
}) {
  const { pushToast } = useToast();
  const sorted = sortByOrder(questions);
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approving, setApproving] = useState(false);

  const selected = sorted.find((question) => question.id === selectedId) ?? sorted[0] ?? null;

  useEffect(() => {
    if (!sorted.some((question) => question.id === selectedId)) {
      setSelectedId(sorted[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  const [textDraft, setTextDraft] = useState(selected?.text ?? "");
  const [answerDraft, setAnswerDraft] = useState(selected?.reference_answer ?? "");
  const [durationDraft, setDurationDraft] = useState(
    selected ? String(Math.round(selected.estimated_duration_sec / 60)) : "",
  );

  useEffect(() => {
    setTextDraft(selected?.text ?? "");
    setAnswerDraft(selected?.reference_answer ?? "");
    setDurationDraft(selected ? String(Math.round(selected.estimated_duration_sec / 60)) : "");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const showConfirm =
    (canManage && SENDABLE_STATUSES.has(vacancyStatus)) ||
    (canEditContent && APPROVABLE_STATUSES.has(vacancyStatus));
  // Пересчитывается на каждый рендер из вопросов — не кэшируем в state, чтобы
  // сумма всегда отражала актуальные estimated_duration_sec после правок.
  const totalDurationMinutes = Math.round(
    questions.reduce((sum, question) => sum + question.estimated_duration_sec, 0) / 60,
  );

  async function saveField<K extends keyof QuestionInput>(field: K, value: QuestionInput[K]) {
    if (!selected) return;
    setError(null);
    try {
      await updateManagedQuestion(vacancyId, selected.id, { [field]: value } as Partial<QuestionInput>);
      await onQuestionsChanged();
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось сохранить изменения."));
    }
  }

  async function handleRegenerate() {
    if (!selected) return;
    setRegenerating(true);
    setError(null);
    try {
      await regenerateManagedQuestion(vacancyId, selected.id);
      await onQuestionsChanged();
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось перегенерировать вопрос."));
    } finally {
      setRegenerating(false);
    }
  }

  async function handleAdd() {
    setAdding(true);
    setError(null);
    try {
      const created = await addManagedQuestion(vacancyId, {
        text: BLANK_QUESTION_TEXT,
        order: sorted.length,
        skill_tag: [],
        intent: "",
        reference_answer: "",
        format: "voice",
        role: "assessment",
        difficulty: "baseline",
        estimated_duration_sec: 180,
      });
      setSelectedId(created.id);
      await onQuestionsChanged();
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось добавить вопрос."));
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteManagedQuestion(vacancyId, selected.id);
      setDeleteOpen(false);
      await onQuestionsChanged();
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось удалить вопрос."));
    } finally {
      setDeleting(false);
    }
  }

  function missingSkillCoverage(): string[] {
    const covered = new Set(
      questions.flatMap((question) => (question.skill_tag ?? []).map((skill) => skill.trim().toLowerCase())),
    );
    return requiredSkills.filter((skill) => !covered.has(skill.trim().toLowerCase()));
  }

  async function handleApprove() {
    const missing = missingSkillCoverage();
    if (missing.length > 0) {
      pushToast("warning", `Нет ни одного вопроса на навыки: ${missing.join(", ")}.`);
      return;
    }

    setApproving(true);
    setError(null);
    try {
      let status = vacancyStatus;
      if (canManage && SENDABLE_STATUSES.has(status)) {
        const updated = await sendManagedVacancyToExpert(vacancyId);
        status = updated.status;
      }
      if (canEditContent && APPROVABLE_STATUSES.has(status)) {
        await approveManagedVacancy(vacancyId);
      }
      await onQuestionsChanged();
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось подтвердить вакансию."));
    } finally {
      setApproving(false);
    }
  }

  if (questions.length === 0) {
    return (
      <section className="question-panel form-panel">
        <h2>Вопросы</h2>
        {canManage ? (
          <>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <Button type="button" disabled={generating} onClick={onGenerate}>
                {generating ? "Собираем…" : "Сгенерировать вопросы"}
              </Button>
            </div>
          </>
        ) : (
          <p className="disabled-hint">Рекрутёр ещё не собрал вопросы для этой вакансии.</p>
        )}
      </section>
    );
  }

  return (
    <section className="question-panel form-panel">
      <div className="question-panel__head">
        <h2>Вопросы</h2>
      </div>
      {error ? <p className="form-error">{error}</p> : null}

      <div className="question-panel__layout">
        <nav className="question-nav" aria-label="Список вопросов">
          {sorted.map((question, index) => (
            <button
              type="button"
              key={question.id}
              className="question-nav__item"
              data-active={question.id === selected?.id || undefined}
              onClick={() => setSelectedId(question.id)}
            >
              <span className="question-nav__number">{index + 1}</span>
              <span className="question-nav__text">{question.text}</span>
            </button>
          ))}
          {canManage ? (
            <button
              type="button"
              className="question-nav__add"
              disabled={adding}
              onClick={() => void handleAdd()}
            >
              {adding ? "Добавляем…" : "+ Добавить вопрос"}
            </button>
          ) : null}
        </nav>

        {selected ? (
          <div className="question-detail">
            <div className="question-detail__meta-row">
              <span className="question-detail__number">Вопрос {sorted.indexOf(selected) + 1}</span>

              {canEditContent ? (
                <select
                  className="question-detail__format-select"
                  value={selected.format}
                  onChange={(event) => void saveField("format", event.target.value as QuestionFormat)}
                  aria-label="Тип вопроса"
                >
                  {QUESTION_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {QUESTION_FORMAT_LABEL[format]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="status">{QUESTION_FORMAT_LABEL[selected.format] ?? selected.format}</span>
              )}

              <span className="question-detail__duration">
                {canEditContent ? (
                  <input
                    className="question-detail__duration-input"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    aria-label="Время на ответ, мин"
                    value={durationDraft}
                    onChange={(event) => setDurationDraft(event.target.value.replace(/[^0-9]/g, ""))}
                    onBlur={() => {
                      const minutes = Number(durationDraft);
                      if (minutes > 0 && minutes * 60 !== selected.estimated_duration_sec) {
                        void saveField("estimated_duration_sec", minutes * 60);
                      }
                    }}
                  />
                ) : (
                  Math.round(selected.estimated_duration_sec / 60)
                )}{" "}
                мин
              </span>

              {canEditContent ? (
                <span className="density-switch" role="group" aria-label="Обязательность вопроса">
                  <button
                    type="button"
                    data-active={selected.role === "assessment" ? "true" : undefined}
                    onClick={() => void saveField("role", "assessment")}
                  >
                    Обязательный
                  </button>
                  <button
                    type="button"
                    data-active={selected.role !== "assessment" ? "true" : undefined}
                    onClick={() => void saveField("role", "warmup")}
                  >
                    Необязательный
                  </button>
                </span>
              ) : (
                <span className="status" data-tone={selected.role === "assessment" ? undefined : "neutral"}>
                  {selected.role === "assessment" ? "Обязательный" : "Необязательный"}
                </span>
              )}

              {canManage ? (
                <span className="question-detail__icon-actions">
                  <button
                    type="button"
                    className="question-detail__icon-button"
                    aria-label="Перегенерировать вопрос"
                    disabled={regenerating}
                    onClick={() => void handleRegenerate()}
                  >
                    <ArrowsClockwise size={16} />
                  </button>
                  <button
                    type="button"
                    className="question-detail__icon-button question-detail__icon-button--danger"
                    aria-label="Удалить вопрос"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash size={16} />
                  </button>
                </span>
              ) : null}
            </div>

            <label>
              Текст вопроса
              {canEditContent ? (
                <textarea
                  value={textDraft}
                  onChange={(event) => setTextDraft(event.target.value)}
                  onBlur={() => {
                    if (textDraft !== selected.text) void saveField("text", textDraft);
                  }}
                />
              ) : (
                <p>{selected.text}</p>
              )}
            </label>

            <label>
              Эталонный ответ
              {canEditContent ? (
                <textarea
                  value={answerDraft}
                  onChange={(event) => setAnswerDraft(event.target.value)}
                  onBlur={() => {
                    if (answerDraft !== selected.reference_answer) {
                      void saveField("reference_answer", answerDraft);
                    }
                  }}
                />
              ) : (
                <p>{selected.reference_answer || "Не указан"}</p>
              )}
            </label>

            <SkillTagInput
              label="Проверяемые навыки"
              skills={selected.skill_tag ?? []}
              onChange={(skills) => void saveField("skill_tag", skills)}
              placeholder={canEditContent ? "python, sql…" : undefined}
            />
          </div>
        ) : null}
      </div>

      {showConfirm ? (
        <div className="question-panel__confirm">
          <span className="disabled-hint">≈{totalDurationMinutes} мин на прохождение</span>
          <Button type="button" disabled={approving} onClick={() => void handleApprove()}>
            {approving ? "Подтверждаем…" : "Подтвердить"}
          </Button>
        </div>
      ) : null}

      <Modal open={deleteOpen} title="Удалить вопрос?" onClose={() => setDeleteOpen(false)}>
        <p>Вопрос «{selected?.text}» пропадёт из комплекта без возможности восстановить.</p>
        <ModalActions>
          <Button type="button" variant="secondary" data-modal-initial-focus onClick={() => setDeleteOpen(false)}>
            Отмена
          </Button>
          <Button type="button" loading={deleting} loadingLabel="Удаляем…" onClick={() => void handleDelete()}>
            Удалить
          </Button>
        </ModalActions>
      </Modal>
    </section>
  );
}
