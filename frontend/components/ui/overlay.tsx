"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

const INITIAL_FOCUS = "[data-modal-initial-focus]";

/**
 * Оверлей по правилам системы: Esc, крестик и клик по фону закрывают,
 * фокус заперт внутри, стартовый фокус — на «Отмена», после закрытия
 * возвращается на элемент, который оверлей открыл.
 */
function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = panel.querySelector<HTMLElement>(INITIAL_FOCUS);
      const first = preferred ?? panel.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === firstNode || !panelRef.current.contains(active))) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && active === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.();
    };
  }, [open, onClose]);

  return panelRef;
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
  const panelRef = useOverlay(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <>
      <button className="drawer-overlay" type="button" aria-label="Закрыть" onClick={onClose} />
      <div
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <div className="evidence-drawer__heading">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button icon-button--small"
            type="button"
            onClick={onClose}
            aria-label="Закрыть панель"
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ overflow: "auto", flex: 1 }}>{children}</div>
      </div>
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
  const panelRef = useOverlay(open, onClose);
  const titleId = useId();
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button icon-button--small"
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>
        <div className="modal-card__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="form-actions modal-actions">{children}</div>;
}

export function ToastStack({ messages }: { messages: string[] }) {
  if (!messages.length || typeof document === "undefined") return null;
  return createPortal(
    <div className="toast-stack">
      {messages.map((message) => (
        <div className="toast" data-tone="success" role="status" key={message}>
          <span>{message}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
