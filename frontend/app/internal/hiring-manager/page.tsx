"use client";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { buildNav } from "@/lib/nav";

const HIRING_MANAGER_AREA = "area.hiring_manager_review";

export default function HiringManagerPage() {
  const { landing, loading } = useProtectedLanding({ requiredArea: HIRING_MANAGER_AREA });

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Loading" text="Checking your session..." />
      </main>
    );
  }

  return (
    <AppShell nav={buildNav(landing)} title="Hiring manager">
      <div className="workspace">
        <PageHeader path="Hiring manager" title="Hiring manager workspace" />
        <ScreenState
          kind="empty"
          title="Not built yet"
          text="Hiring manager workspace is reserved for vacancy review workflows."
        />
      </div>
    </AppShell>
  );
}
