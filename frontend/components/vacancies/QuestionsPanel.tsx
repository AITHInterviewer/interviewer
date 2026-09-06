"use client";

import { useEffect, useState } from "react";

import { SkillTagInput } from "@/components/chrome/SkillTagInput";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/overlay";
import type { Question, QuestionInput } from "@/lib/api";
import {
  addManagedQuestion,
  deleteManagedQuestion,
  regenerateManagedQuestion,
  updateManagedQuestion,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { QUESTION_FORMAT_LABEL } from "@/lib/pipeline";

const BLANK_QUESTION_TEXT = "Новый вопрос — заполните текст или перегенерируйте";

function sortByOrder(questions: Question[]): Question[] {
  return [...questions].sort((a, b) => a.order - b.order);
}

function durationLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return minutes > 0 ? `≈${minutes} мин` : "—";
}

export function QuestionsPanel({
  vacancyId,
  questions,
  canManage,
  canEditContent,
  generating,
  onGenerate,
  onQuestionsChanged,
}: {
  vacancyId: string;
  questions: Question[];
  /** Может генерировать/добавлять/удалять/перегенерировать вопросы (рекрутёр). */
  canManage: boolean;
  /** Может редактировать содержимое вопроса — текст/ответ/навыки/время (эксперт). */
  canEditContent: boolean;
  generating: boolean;
  onGenerate: () => void;
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
        {canManage ? (
          <Button
            type="button"
            variant="secondary"
            disabled={!selected || regenerating}
            onClick={() => void handleRegenerate()}
          >
            {regenerating ? "Перегенерируем…" : "Перегенерировать"}
          </Button>
        ) : null}
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
              <span className="status">{QUESTION_FORMAT_LABEL[selected.format] ?? selected.format}</span>
              <span className="status" data-tone={selected.role === "assessment" ? undefined : "neutral"}>
                {selected.role === "assessment" ? "Обязательный" : "Необязательный"}
              </span>
              <span className="question-detail__duration">{durationLabel(selected.estimated_duration_sec)}</span>
              {canManage ? (
                <button
                  type="button"
                  className="question-detail__delete"
                  aria-label="Удалить вопрос"
                  onClick={() => setDeleteOpen(true)}
                >
                  Удалить
                </button>
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

            {canEditContent ? (
              <label className="question-detail__duration-field">
                Время на ответ, мин
                <input
                  type="number"
                  min={1}
                  value={durationDraft}
                  onChange={(event) => setDurationDraft(event.target.value)}
                  onBlur={() => {
                    const minutes = Number(durationDraft);
                    if (minutes > 0 && minutes * 60 !== selected.estimated_duration_sec) {
                      void saveField("estimated_duration_sec", minutes * 60);
                    }
                  }}
                />
              </label>
            ) : null}
          </div>
        ) : null}
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
