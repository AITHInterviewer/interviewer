"use client";

import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";

/**
 * Карточка человека по эталону: инициалы, имя, стадия словами, оценка (status).
 * Переход — стрелкой справа внизу (action — подпись для aria-label, текст не дублируем:
 * имя уже на карточке).
 */
export function CandidateCard({
  name,
  stage,
  status,
  action,
  href,
  accent,
}: {
  name: string;
  stage: string;
  status?: ReactNode;
  action?: string;
  href?: string;
  accent?: boolean;
}) {
  const body = (
    <>
      <span className="candidate-card__top">
        <Avatar name={name} accent={accent} />
        <strong>{name}</strong>
        {action && href ? (
          <span className="candidate-card__action" aria-hidden="true">
            <CaretRight size={15} />
          </span>
        ) : null}
      </span>
      <p>{stage}</p>
      {status}
    </>
  );

  if (!href) {
    return <article className="candidate-card">{body}</article>;
  }

  return (
    <Link
      className="candidate-card candidate-card--interactive"
      href={href}
      aria-label={action ? `${action} ${name}` : undefined}
    >
      {body}
    </Link>
  );
}
