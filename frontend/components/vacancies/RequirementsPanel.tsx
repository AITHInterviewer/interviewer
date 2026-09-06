"use client";

import { Trash } from "@phosphor-icons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/overlay";
import type { Requirement, RequirementLevel } from "@/lib/api";

/** Сколько минут закладываем на требование каждого уровня — та же шкала, что в промпте
 * генерации вопросов (backend/app/prompts/vacancy_question_set.txt). */
const LEVEL_MINUTES: Record<RequirementLevel, number> = { basic: 2, confident: 3, expert: 4 };
const LEVEL_LABEL: Record<RequirementLevel, string> = {
  basic: "Базовый",
  confident: "Уверенный",
  expert: "Эксперт",
};
// Разогрев + завершение: два коротких вопроса сверх требований.
const WARMUP_CLOSING_MINUTES = 4;
export const MIN_REQUIREMENTS = 3;

/** «1 требование» / «3 требования» / «5 требований» — иначе счётчик читается как машинный. */
export function requirementsLabel(count: number): string {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return `${count} требований`;
  const last = count % 10;
  if (last === 1) return `${count} требование`;
  if (last >= 2 && last <= 4) return `${count} требования`;
  return `${count} требований`;
}

export function estimateMinutes(requirements: Requirement[]): number {
  const body = requirements.reduce((sum, item) => sum + LEVEL_MINUTES[item.level], 0);
  return body === 0 ? 0 : body + WARMUP_CLOSING_MINUTES;
}

function nextId(requirements: Requirement[]): string {
  const used = new Set(requirements.map((item) => item.id));
  let index = requirements.length;
  while (used.has(`req_${index}`)) index += 1;
  return `req_${index}`;
}

/** Список требований вакансии. Тот же скелет, что у `QuestionsPanel`: слева навигация,
 * справа детали выбранного, внизу полоса подтверждения — чтобы рекрутёр и эксперт
 * работали в одном и том же экране, а не в двух похожих. */
export function RequirementsPanel({
  requirements,
  onChange,
  readOnly,
  confirmLabel,
  confirmHint,
  confirmLoadingLabel,
  confirmDisabledReason,
  busy,
  onConfirm,
  extraAction,
}: {
  requirements: Requirement[];
  onChange: (requirements: Requirement[]) => void;
  readOnly?: boolean;
  /** Не передан — главного действия у этого зрителя сейчас нет, рисуем только подсказку. */
  confirmLabel?: string | null;
  /** Подпись слева от кнопки: что произойдёт после нажатия. */
  confirmHint?: string;
  confirmLoadingLabel?: string;
  /** Не пусто — кнопка заблокирована, текст показывается вместо подсказки. */
  confirmDisabledReason?: string | null;
  busy?: boolean;
  onConfirm?: () => void;
  extraAction?: React.ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(requirements[0]?.id ?? null);
  const [pendingDelete, setPendingDelete] = useState<Requirement | null>(null);

  // Ресинк выбранного не нужен: если требование удалили, `find` не находит его и выбор
  // сам падает на первое в списке.
  const selected = requirements.find((item) => item.id === selectedId) ?? requirements[0] ?? null;
  const minutes = estimateMinutes(requirements);

  function patch(id: string, changes: Partial<Requirement>) {
    onChange(
      requirements.map((item) =>
        item.id === id
          ? { ...item, ...changes, source: item.source === "llm" ? "edited" : item.source }
          : item,
      ),
    );
  }

  function addRequirement() {
    const created: Requirement = {
      id: nextId(requirements),
      name: "",
      kind: "must",
      level: "confident",
      evidence: "",
      source: "manual",
    };
    onChange([...requirements, created]);
    setSelectedId(created.id);
  }

  return (
    <section className="question-panel form-panel">
      <div className="question-panel__head">
        <h2>Требования</h2>
        <span className="disabled-hint">Проверим все на интервью</span>
      </div>

      <div className="question-panel__layout">
        <nav className="question-nav" aria-label="Список требований">
          {requirements.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className="question-nav__item"
              data-active={item.id === selected?.id || undefined}
              onClick={() => setSelectedId(item.id)}
            >
              <span className="question-nav__number">{index + 1}</span>
              <span className="question-nav__text">{item.name || "Без названия"}</span>
            </button>
          ))}
          {readOnly ? null : (
            <button type="button" className="question-nav__add" onClick={addRequirement}>
              + Добавить требование
            </button>
          )}
        </nav>

        {selected ? (
          <div className="question-detail">
            <div className="question-detail__meta-row">
              <span className="question-detail__number">
                Требование {requirements.indexOf(selected) + 1}
              </span>

              {readOnly ? (
                <>
                  <span className="status">
                    {selected.kind === "must" ? "Обязательное" : "Желательное"}
                  </span>
                  <span className="status">{LEVEL_LABEL[selected.level]}</span>
                </>
              ) : (
                <>
                  <span className="density-switch" role="group" aria-label="Важность требования">
                    <button
                      type="button"
                      data-active={selected.kind === "must" || undefined}
                      onClick={() => patch(selected.id, { kind: "must" })}
                    >
                      Обязательное
                    </button>
                    <button
                      type="button"
                      data-active={selected.kind === "nice" || undefined}
                      onClick={() => patch(selected.id, { kind: "nice" })}
                    >
                      Желательное
                    </button>
                  </span>

                  <span className="density-switch" role="group" aria-label="Уровень владения">
                    {(["basic", "confident", "expert"] as RequirementLevel[]).map((level) => (
                      <button
                        key={level}
                        type="button"
                        data-active={selected.level === level || undefined}
                        onClick={() => patch(selected.id, { level })}
                      >
                        {LEVEL_LABEL[level]}
                      </button>
                    ))}
                  </span>

                  <span className="question-detail__icon-actions">
                    <button
                      type="button"
                      className="question-detail__icon-button question-detail__icon-button--danger"
                      aria-label="Удалить требование"
                      onClick={() => setPendingDelete(selected)}
                    >
                      <Trash size={16} />
                    </button>
                  </span>
                </>
              )}
            </div>

            <label>
              Название требования
              {readOnly ? (
                <p>{selected.name || "Без названия"}</p>
              ) : (
                <input
                  value={selected.name}
                  placeholder="Например: Apache Kafka"
                  onChange={(event) => patch(selected.id, { name: event.target.value })}
                />
              )}
            </label>

            <label>
              Откуда в описании
              <p className="requirement-evidence">
                {selected.evidence || "Добавлено вручную — в описании этого нет."}
              </p>
            </label>
          </div>
        ) : (
          <p className="disabled-hint">Требований пока нет.</p>
        )}
      </div>

      <div className="question-panel__confirm">
        {extraAction}
        <span className="disabled-hint">
          {confirmDisabledReason
            ? confirmDisabledReason
            : (confirmHint ?? `${requirementsLabel(requirements.length)} · ≈${minutes} мин интервью`)}
        </span>
        {confirmLabel ? (
          <Button
            type="button"
            loading={busy}
            loadingLabel={confirmLoadingLabel}
            disabled={Boolean(confirmDisabledReason)}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        ) : null}
      </div>

      <Modal
        open={pendingDelete !== null}
        title="Удалить требование?"
        onClose={() => setPendingDelete(null)}
      >
        <p>
          «{pendingDelete?.name || "Без названия"}» пропадёт из списка. Вернуть можно только
          добавив требование заново.
        </p>
        <ModalActions>
          <Button
            type="button"
            variant="secondary"
            data-modal-initial-focus
            onClick={() => setPendingDelete(null)}
          >
            Отмена
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (pendingDelete) {
                onChange(requirements.filter((item) => item.id !== pendingDelete.id));
              }
              setPendingDelete(null);
            }}
          >
            Удалить
          </Button>
        </ModalActions>
      </Modal>
    </section>
  );
}
