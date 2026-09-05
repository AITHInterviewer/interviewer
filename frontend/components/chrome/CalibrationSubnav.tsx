"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CalibrationSubnavInner({ vacancyId }: { vacancyId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromRecruiter = searchParams.get("from") === "recruiter";
  const suffix = fromRecruiter ? "?from=recruiter" : "";
  const items = [
    { href: `/vacancies/${vacancyId}/rubric`, label: "Критерии" },
    { href: `/vacancies/${vacancyId}/questions`, label: "Вопросы" },
    { href: `/vacancies/${vacancyId}/approve`, label: "Утверждение" },
  ];

  return (
    <nav className="workspace-subnav" aria-label="Шаги калибровки">
      {items.map((item) => (
        <Link key={item.href} href={`${item.href}${suffix}`} data-active={pathname === item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function CalibrationSubnav({ vacancyId }: { vacancyId: string }) {
  return (
    <Suspense fallback={<nav className="workspace-subnav" aria-label="Шаги калибровки" />}>
      <CalibrationSubnavInner vacancyId={vacancyId} />
    </Suspense>
  );
}
