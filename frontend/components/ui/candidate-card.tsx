"use client";

import Link from "next/link";
import { FileText } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { formatRankingScore } from "@/lib/pipeline";

/**
 * Карточка человека: инициалы, имя, метка-пилюля, балл процентом, иконка отчёта.
 */
export function CandidateCard({
  name,
  mark,
  score,
  action,
  href,
  accent,
}: {
  name: string;
  mark: ReactNode;
  score?: number | null;
  action?: string;
  href?: string;
  accent?: boolean;
}) {
  const label = action ?? `Открыть отчёт: ${name}`;
  const body = (
    <>
      <span className="candidate-card__top">
        <Avatar name={name} accent={accent} />
        <strong>{name}</strong>
        {href ? (
          <span className="candidate-card__action" aria-hidden="true">
            <FileText size={16} />
          </span>
        ) : null}
      </span>
      <div className="candidate-card__meta">
        {mark}
        {score != null ? <span>{formatRankingScore(score)}%</span> : null}
      </div>
    </>
  );

  if (!href) {
    return <article className="candidate-card">{body}</article>;
  }

  return (
    <Link className="candidate-card candidate-card--interactive" href={href} aria-label={label}>
      {body}
    </Link>
  );
}
