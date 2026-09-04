"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { ScreenState } from "@/components/chrome/ScreenState";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { getRequirement } from "@/lib/demo/rubric";

function titlesFor(ids: string[]): string {
  const names = ids
    .map((id) => getRequirement(id)?.title)
    .filter((title): title is string => Boolean(title));
  return names.join(", ") || "нет";
}

export default function ResultPage() {
  const params = useParams<{ token: string }>();
  const candidate = getCandidateByToken(params.token);

  if (!candidate) {
    return (
      <main className="workspace">
        <ScreenState
          kind="error"
          title="Итог не найден"
          text="Такого кандидата в демо нет. Вернитесь ко входу."
          action={
            <Button asChild variant="secondary">
              <Link href="/login">К выбору роли</Link>
            </Button>
          }
        />
      </main>
    );
  }

  const confirmed = candidate.report.filter((item) => item.status === "Подтверждено");
  const partial = candidate.report.filter((item) => item.status === "Частично" || item.status === "Недостаточно данных");
  const unchecked = candidate.report.filter((item) => item.status === "Не проверено");

  return (
    <CandidateShell step="Готово">
      <PilotBadge />
      <section className="completion-stage">
        <h1>Итог по интервью</h1>
        <div className="next-steps">
          <div>
            <span>Подтвердилось</span>
            <strong>{titlesFor(confirmed.map((item) => item.requirementId))}</strong>
          </div>
          <div>
            <span>Раскрыто частично</span>
            <strong>{titlesFor(partial.map((item) => item.requirementId))}</strong>
          </div>
          <div>
            <span>Не проверялось</span>
            <strong>{titlesFor(unchecked.map((item) => item.requirementId))}</strong>
          </div>
          <div>
            <span>Решение рекрутера</span>
            <strong>Приглашение на встречу с командой</strong>
          </div>
        </div>
        <Button asChild variant="secondary">
          <Link href={`/i/${candidate.token}/done`}>Назад</Link>
        </Button>
      </section>
    </CandidateShell>
  );
}
