"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { useTheme } from "@/lib/theme";

export function BrandMark() {
  return (
    <div className="brand-mark" aria-label="Napoleon Interview">
      <strong>NAPOLEON</strong>
      <span>[INTERVIEW]</span>
    </div>
  );
}

type NavItem = { href: string; label: string };

export function AppShell({
  children,
  nav,
  title,
}: {
  children: ReactNode;
  nav: NavItem[];
  title?: string;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="app-shell">
      <aside className="app-shell__nav" aria-label="Навигация">
        <BrandMark />
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} data-active={active}>
              {item.label}
            </Link>
          );
        })}
      </aside>
      <div className="app-shell__main">
        <div className="app-shell__top">
          <span style={{ color: "var(--ink-secondary)", fontSize: 13 }}>{title ?? "Рабочая область"}</span>
          <button
            className="icon-button"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
          >
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function recruiterNav(): NavItem[] {
  return [{ href: "/vacancies", label: "Вакансии" }];
}

export function expertNav(): NavItem[] {
  return [
    { href: "/expert", label: "Мои задачи" },
    { href: "/vacancies/python-middle/rubric", label: "Рубрика" },
    { href: "/vacancies/python-middle/questions", label: "Комплект" },
  ];
}

export function managerNav(): NavItem[] {
  return [
    { href: "/manager", label: "К встречам" },
    { href: "/manager/lida", label: "Лидия Орлова" },
  ];
}
