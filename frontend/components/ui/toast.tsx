"use client";

import { CheckCircle, Warning, WarningOctagon, X } from "@phosphor-icons/react";
import { createPortal } from "react-dom";

export type ToastTone = "success" | "warning" | "error";

export type ToastItem = { id: string; tone: ToastTone; text: string };

const ICONS = {
  success: CheckCircle,
  warning: Warning,
  error: WarningOctagon,
};

/** Тост эталона: вид, иконка, роль для скринридера, кнопка закрытия. */
export function Toast({ item, onClose }: { item: ToastItem; onClose?: (id: string) => void }) {
  const Icon = ICONS[item.tone];
  return (
    <div className="toast" data-tone={item.tone} role={item.tone === "error" ? "alert" : "status"}>
      <Icon size={18} weight="fill" />
      <span>{item.text}</span>
      {onClose ? (
        <button type="button" aria-label="Закрыть уведомление" onClick={() => onClose(item.id)}>
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function ToastStack({
  items,
  onClose,
}: {
  items: ToastItem[];
  onClose?: (id: string) => void;
}) {
  if (!items.length || typeof document === "undefined") return null;
  return createPortal(
    <div className="toast-stack">
      {items.map((item) => (
        <Toast key={item.id} item={item} onClose={onClose} />
      ))}
    </div>,
    document.body,
  );
}
