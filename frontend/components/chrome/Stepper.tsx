"use client";

import { Check } from "@phosphor-icons/react";

export function Stepper({ steps, current }: { steps: string[]; current: string }) {
  const currentIndex = steps.indexOf(current);
  return (
    <ol className="stepper" aria-label="Прогресс интервью">
      {steps.map((label, index) => (
        <li key={label} data-active={index === currentIndex} data-done={index < currentIndex}>
          {index < currentIndex ? <Check size={14} /> : null}
          {label}
        </li>
      ))}
    </ol>
  );
}
