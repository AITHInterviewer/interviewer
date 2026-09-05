"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { vacancyContextNav } from "@/lib/nav";

export function VacancyContextNav({
  vacancyId,
  includeSettings = true,
}: {
  vacancyId: string;
  includeSettings?: boolean;
}) {
  const pathname = usePathname();
  const items = vacancyContextNav(vacancyId, { includeSettings });

  return (
    <nav className="workspace-subnav" aria-label="Разделы вакансии">
      {items.map((item) => {
        const path = item.href.split("?")[0];
        return (
          <Link key={item.href} href={item.href} data-active={pathname === path}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
