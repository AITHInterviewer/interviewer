"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { ToastStack, type ToastItem, type ToastTone } from "@/components/ui/toast";

const TOAST_TTL_MS = 5000;

type ToastContextValue = {
  pushToast: (tone: ToastTone, text: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** Глобальный тост-стек: живёт в корневом layout, поэтому переживает
 * клиентский переход между страницами (в отличие от локального state страницы). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const closeToast = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (tone: ToastTone, text: string) => {
      const id = `toast-${nextId.current++}`;
      setItems((current) => [...current, { id, tone, text }]);
      setTimeout(() => closeToast(id), TOAST_TTL_MS);
    },
    [closeToast],
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack items={items} onClose={closeToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
