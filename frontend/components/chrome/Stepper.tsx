"use client";

import { Check } from "@phosphor-icons/react";

/**
 * Шаги интервью по дизайн-системе: пройденный зелёной пилюлей с галочкой,
 * текущий акцентной, будущий контуром с номером.
 */
export function Stepper({ steps, current }: { steps: string[]; current: string }) {
  const currentIndex = steps.indexOf(current);
  return (
    <ol className="stepper" aria-label="Прогресс интервью">
      {steps.map((label, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={label}
            data-active={active || undefined}
            data-done={done || undefined}
            aria-current={active ? "step" : undefined}
          >
            <span className="stepper__mark">
              {done ? <Check size={11} weight="bold" /> : index + 1}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
