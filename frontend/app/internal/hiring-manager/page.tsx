"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { buildNav } from "@/lib/nav";

const HIRING_MANAGER_AREA = "area.hiring_manager_review";

export default function HiringManagerPage() {
  const router = useRouter();
  const { landing, loading } = useProtectedLanding({ requiredArea: HIRING_MANAGER_AREA });

  useEffect(() => {
    if (landing) {
      router.replace("/manager");
    }
  }, [landing, router]);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  return (
    <AppShell nav={buildNav(landing)} title="Встречи">
      <div className="workspace">
        <PageHeader path="Менеджер" title="Встречи" />
        <ScreenState kind="loading" title="Встречи" text="Переходим к списку встреч…" />
      </div>
    </AppShell>
  );
}
