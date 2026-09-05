"use client";

import { useId, type ReactNode } from "react";

/**
 * Причина рядом с выключенным действием. Текст доступен скринридеру
 * через aria-describedby, а не только по наведению мыши.
 */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="tooltip-host">
      {children}
      <span className="tooltip-bubble" id={id} role="tooltip">
        {text}
      </span>
      <span className="visually-hidden">{text}</span>
    </span>
  );
}
