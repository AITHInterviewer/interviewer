"use client";

import Link from "next/link";

import { AppShell, expertNav } from "@/components/chrome/AppShell";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { vacancy } from "@/lib/demo/vacancies";

export default function ExpertTasksPage() {
  return (
    <AppShell nav={expertNav()} title="Мои задачи">
      <main className="workspace">
        <header className="page-title">
          <div>
            <h1>Мои задачи</h1>
            <PilotBadge />
          </div>
        </header>
        <section className="form-surface" style={{ border: "1px solid var(--border)", borderRadius: 12 }}>
          <h2>Калибровка</h2>
          <p>
            {vacancy.title} · статус На проверке · поступило 2 сентября
          </p>
          <Button asChild>
            <Link href={`/vacancies/${vacancy.id}/rubric`}>Открыть</Link>
          </Button>
        </section>
        <section className="form-surface" style={{ border: "1px solid var(--border)", borderRadius: 12, marginTop: 16 }}>
          <h2>Аудит</h2>
          <p>Middle+ Python · 5 отчётов ждут проверки · ~20 минут</p>
          <Button asChild variant="secondary">
            <Link href={`/audit/${vacancy.id}`}>Открыть аудит</Link>
          </Button>
        </section>
      </main>
    </AppShell>
  );
}
