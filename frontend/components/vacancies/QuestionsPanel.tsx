"use client";

import { ArrowsClockwise, Trash } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SkillTagInput } from "@/components/chrome/SkillTagInput";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/overlay";
import type { Question, QuestionFormat, QuestionInput } from "@/lib/api";
import {
  addManagedQuestion,
  deleteManagedQuestion,
  regenerateManagedQuestion,
  updateManagedQuestion,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { QUESTION_FORMAT_LABEL } from "@/lib/pipeline";

const BLANK_QUESTION_TEXT = "Новый вопрос — заполните текст или перегенерируйте";
const QUESTION_FORMATS: QuestionFormat[] = ["voice", "code_review_verbal", "live_coding"];

function sortByOrder(questions: Question[]): Question[] {
  return [...questions].sort((a, b) => a.order - b.order);
}

export function QuestionsPanel({
  vacancyId,
  questions,
  canManage,
  canEditContent,
  onQuestionsChanged,
}: {
  vacancyId: string;
  questions: Question[];
  /** Может добавлять/удалять/перегенерировать вопросы (рекрутёр). */
  canManage: boolean;
  /** Может редактировать содержимое вопроса — текст/ответ/навыки/время (эксперт). */
  canEditContent: boolean;
  onQuestionsChanged: () => Promise<void>;
}) {
  const sorted = sortByOrder(questions);
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  if (questions.length === 0) {
    // Вопросы больше не собираются вручную: их даёт одобрение требований экспертом
    // (specs/010-vacancy-from-description).
    return (
      <section className="question-panel form-panel">
        <h2>Вопросы</h2>
        <p className="disabled-hint">
          Комплект соберётся сам, когда эксперт одобрит требования вакансии.
        </p>
        <div className="form-actions">
          <Button type="button" variant="secondary" asChild>
            <Link href={`/vacancies/${vacancyId}/rubric`}>Открыть требования</Link>
          </Button>
        </div>
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

      <div className="question-panel__confirm">
        <span className="disabled-hint">≈{totalDurationMinutes} мин на прохождение</span>
      </div>

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
