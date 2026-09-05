"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  CalendarBlank,
  ClipboardText,
  Moon,
  Sun,
  UserCircle,
  Users,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/shadcn/sidebar";
import { useTheme } from "@/lib/theme";
import { vacancyContextNav } from "@/lib/nav";

export function BrandMark() {
  return (
    <div className="brand-mark" aria-label="Napoleon Interview">
      <strong>NAPOLEON</strong>
      <span>[INTERVIEW]</span>
    </div>
  );
}

type NavItem = { href: string; label: string };

/** Иконка первого уровня по адресу пункта. Второй уровень идёт без иконок. */
function navIcon(href: string) {
  if (href.startsWith("/vacancies")) return <Briefcase size={16} />;
  if (href.startsWith("/expert")) return <ClipboardText size={16} />;
  if (href.startsWith("/manager")) return <CalendarBlank size={16} />;
  if (href.startsWith("/internal/users")) return <Users size={16} />;
  return <UserCircle size={16} />;
}

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

  // Контекстная группа появляется, только когда человек внутри вакансии.
  const vacancySegment = pathname.startsWith("/vacancies/") ? pathname.split("/")[2] : undefined;
  const openVacancyId = vacancySegment && vacancySegment !== "new" ? vacancySegment : undefined;
  const showVacancyGroup =
    Boolean(openVacancyId) && nav.some((item) => item.href === "/vacancies");

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <BrandMark />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={item.href === activeHref} tooltip={item.label}>
                      <Link href={item.href}>
                        {navIcon(item.href)}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {showVacancyGroup && item.href === "/vacancies" && openVacancyId ? (
                      <SidebarMenuSub>
                        {vacancyContextNav(openVacancyId).map((sub) => (
                          <SidebarMenuSubItem key={sub.href}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={pathname === sub.href.split("?")[0]}
                            >
                              <Link href={sub.href}>{sub.label}</Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {showVacancyGroup && openVacancyId ? (
            <SidebarGroup>
              <SidebarGroupLabel>Открытая вакансия</SidebarGroupLabel>
            </SidebarGroup>
          ) : null}
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="К выбору роли">
                <Link href="/login">
                  <UserCircle size={16} />
                  <span>К выбору роли</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="app-topbar">
          <SidebarTrigger className="icon-button" />
          <span className="app-shell__title">{title ?? "Рабочая область"}</span>
          <div className="app-shell__top-actions">
            <button
              className="icon-button"
              type="button"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
        </header>
        <div className="app-shell__main">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
