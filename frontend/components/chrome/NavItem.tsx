"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Пункт меню эталона: иконка только на первом уровне, счётчик вторичным
 * цветом справа, выключенный пункт объясняет причину.
 */
export function NavItem({
  href,
  label,
  icon,
  count,
  active,
  sub,
  disabledReason,
}: {
  href?: string;
  label: string;
  icon?: ReactNode;
  count?: number;
  active?: boolean;
  sub?: boolean;
  disabledReason?: string;
}) {
  const body = (
    <>
      <span className="nav-item__label">
        {!sub && icon}
        <span>{label}</span>
      </span>
      {count !== undefined ? <span className="nav-item__count">{count}</span> : null}
    </>
  );

  if (!href) {
    return (
      <button className="nav-item" type="button" disabled data-sub={sub} title={disabledReason}>
        {body}
      </button>
    );
  }

  return (
    <Link className="nav-item" href={href} data-active={active} data-sub={sub}>
      {body}
    </Link>
  );
}
