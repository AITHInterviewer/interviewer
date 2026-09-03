"use client";

import { useParams } from "next/navigation";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { getCandidateByToken } from "@/lib/demo/candidates";

export default function ResultPage() {
  const params = useParams<{ token: string }>();
  const candidate = getCandidateByToken(params.token);
  if (!candidate) return null;

  const confirmed = candidate.report.filter((item) => item.status === "Подтверждено");
  const partial = candidate.report.filter((item) => item.status === "Частично" || item.status === "Недостаточно данных");
  const unchecked = candidate.report.filter((item) => item.status === "Не проверено");

  return (
    <CandidateShell step="Готово">
      <PilotBadge />
      <section className="completion-stage" style={{ marginTop: 16 }}>
        <h1>Итог по интервью</h1>
        <div className="next-steps">
          <div>
            <span>Подтвердилось</span>
            <strong>{confirmed.map((item) => item.requirementId).join(", ") || "нет"}</strong>
          </div>
          <div>
            <span>Раскрыто частично</span>
            <strong>{partial.map((item) => item.requirementId).join(", ") || "нет"}</strong>
          </div>
          <div>
            <span>Не проверялось</span>
            <strong>{unchecked.map((item) => item.requirementId).join(", ") || "нет"}</strong>
          </div>
          <div>
            <span>Решение рекрутера</span>
            <strong>Приглашение на встречу с командой</strong>
          </div>
        </div>
      </section>
    </CandidateShell>
  );
}
