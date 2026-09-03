import type { RequirementStatus } from "@/lib/demo/types";

const ICONS: Record<RequirementStatus, string> = {
  Подтверждено: "●",
  Частично: "◐",
  "Не подтверждено": "○",
  "Недостаточно данных": "◌",
  "Не проверено": "-",
  Противоречие: "!",
};

const TONES: Record<RequirementStatus, string> = {
  Подтверждено: "positive",
  Частично: "warning",
  "Не подтверждено": "danger",
  "Недостаточно данных": "insufficient",
  "Не проверено": "neutral",
  Противоречие: "warning",
};

export function StatusBadge({ status }: { status: RequirementStatus }) {
  return (
    <span className="status" data-tone={TONES[status]}>
      {ICONS[status]} {status}
    </span>
  );
}
