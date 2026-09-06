"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import { clearSession, getSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/nav";

export function BrandMark() {
  return (
    <div className="brand-mark" aria-label="async INTERVIEWER">
      <strong>async</strong>
      <span>[INTERVIEWER]</span>
    </div>
  );
}

type NavItem = { href: string; label: string };

function AccountMenu() {
  const router = useRouter();
  const user = getSession()?.user;

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  if (!user) {
    return null;
  }

  const roleLabels = user.roles.map((role) => ROLE_LABEL[role] ?? role).join(", ");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="account-trigger">
        <Avatar name={user.name} />
        <span className="account-trigger__id">
          <span className="account-trigger__name">{user.name}</span>
          {roleLabels ? <span className="account-trigger__roles">{roleLabels}</span> : null}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>Выйти</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  children,
}: {
  children: ReactNode;
  // Список пунктов и заголовок больше не рендерятся в топбаре: раньше это была
  // навигация сайдбара и подпись рядом с ней, теперь заголовок страницы и так
  // виден в контенте (PageHeader). Пропы сохранены, чтобы не трогать вызывающий
  // код на всех страницах разом.
  nav?: NavItem[];
  title?: string;
}) {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <BrandMark />
        <div className="app-shell__top-actions">
          <AccountMenu />
        </div>
      </header>
      <div className="app-shell__main">{children}</div>
    </div>
  );
}
