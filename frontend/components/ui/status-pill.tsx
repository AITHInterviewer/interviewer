import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Шесть словесных статусов требования плюс метка пилота. Новых значений не заводим. */
export type StatusTone =
  | "confirmed"
  | "partial"
  | "unconfirmed"
  | "insufficient"
  | "unchecked"
  | "contradiction"
  | "pilot";

const LABELS: Record<StatusTone, string> = {
  confirmed: "Подтверждено",
  partial: "Частично",
  unconfirmed: "Не подтверждено",
  insufficient: "Недостаточно данных",
  unchecked: "Не проверено",
  contradiction: "Противоречие",
  pilot: "Пилот",
};

/** Русский статус из моков в тон пилюли. */
export function toneFromLabel(label: string): StatusTone {
  const found = (Object.keys(LABELS) as StatusTone[]).find((key) => LABELS[key] === label);
  return found ?? "unchecked";
}

export function StatusPill({
  tone,
  children,
  icon,
  className,
}: {
  tone: StatusTone;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("status-pill", className)} data-tone={tone}>
      {icon}
      {children ?? LABELS[tone]}
    </span>
  );
}
