"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <>
      <button className="drawer-overlay" type="button" aria-label="Закрыть" onClick={onClose} />
      <aside className="drawer-panel" aria-label={title}>
        <div className="evidence-drawer__heading">
          <h2>{title}</h2>
          <button className="icon-button icon-button--small" type="button" onClick={onClose} aria-label="Закрыть панель">
            <X size={16} />
          </button>
        </div>
        <div style={{ overflow: "auto", flex: 1 }}>{children}</div>
      </aside>
    </>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="section-heading">
          <h2>{title}</h2>
          <button className="icon-button icon-button--small" type="button" onClick={onClose} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

export function ToastStack({ messages }: { messages: string[] }) {
  if (!messages.length || typeof document === "undefined") return null;
  return createPortal(
    <div className="toast-stack" aria-live="polite">
      {messages.map((message) => (
        <div className="toast" key={message}>
          {message}
        </div>
      ))}
    </div>,
    document.body,
  );
}
