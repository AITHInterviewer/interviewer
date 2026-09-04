"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "@phosphor-icons/react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { useTheme } from "@/lib/theme";
import { clearDemoRole, getDemoRole, subscribeDemoRole } from "@/lib/demo/session";

export function BrandMark() {
  return (
    <div className="brand-mark" aria-label="Napoleon Interview">
      <strong>NAPOLEON</strong>
      <span>[INTERVIEW]</span>
    </div>
  );
}

type NavItem = { href: string; label: string };

function longestMatchingHref(pathname: string, items: NavItem[]): string | null {
  const matches = items.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, item) => (item.href.length > best.href.length ? item : best)).href;
}

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
  const [mounted, setMounted] = useState(false);
  const role = useSyncExternalStore(subscribeDemoRole, getDemoRole, () => null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const items = mounted && role === "admin" ? adminNav() : nav;
  const activeHref = longestMatchingHref(pathname, items);

  return (
    <div className="app-shell">
      <aside className="app-shell__nav" aria-label="Навигация">
        <BrandMark />
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link key={item.href} href={item.href} data-active={active}>
              {item.label}
            </Link>
          );
        })}
      </aside>
      <div className="app-shell__main">
        <div className="app-shell__top">
          <span className="app-shell__title">{title ?? "Рабочая область"}</span>
          <div className="app-shell__top-actions">
            <Link className="app-shell__role-link" href="/login" onClick={() => clearDemoRole()}>
              К выбору роли
            </Link>
            <button
              className="icon-button"
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
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
    { href: "/audit/python-middle", label: "Аудит" },
    { href: "/vacancies/python-middle/approve", label: "Утверждение" },
  ];
}

export function managerNav(): NavItem[] {
  return [
    { href: "/manager", label: "К встречам" },
    { href: "/manager/lida", label: "Лидия Орлова" },
  ];
}

export function adminNav(): NavItem[] {
  return [
    { href: "/vacancies", label: "Вакансии" },
    { href: "/vacancies/python-middle", label: "Доска" },
    { href: "/vacancies/new", label: "Новая вакансия" },
    { href: "/vacancies/python-middle/settings", label: "Настройки" },
    { href: "/vacancies/python-middle/candidates/lida", label: "Отчёт Лидии" },
    { href: "/expert", label: "Задачи эксперта" },
    { href: "/vacancies/python-middle/rubric", label: "Рубрика" },
    { href: "/vacancies/python-middle/questions", label: "Комплект" },
    { href: "/vacancies/python-middle/approve", label: "Утверждение" },
    { href: "/audit/python-middle", label: "Аудит" },
    { href: "/manager", label: "К встречам" },
    { href: "/manager/lida", label: "Лидия" },
    { href: "/brief/python-middle", label: "Бриф" },
    { href: "/i/lida/result", label: "Итог кандидата" },
    { href: "/i/lida/extra/lida", label: "Доп. вопрос (пилот)" },
  ];
}
