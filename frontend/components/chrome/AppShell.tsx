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
  const activeHref = longestMatchingHref(pathname, nav);

  return (
    <div className="app-shell">
      <aside className="app-shell__nav" aria-label="Навигация">
        <BrandMark />
        {nav.map((item) => {
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
            <Link className="app-shell__role-link" href="/login">
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
