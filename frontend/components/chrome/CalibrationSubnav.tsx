"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { calibrationSubnavItems, isRecruiterViewMode } from "@/lib/nav";

function CalibrationSubnavInner({ vacancyId }: { vacancyId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromRecruiter = isRecruiterViewMode(searchParams.get("from"));
  const suffix = fromRecruiter ? "?from=recruiter" : "";
  const items = calibrationSubnavItems(vacancyId);

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
