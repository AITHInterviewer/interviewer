"use client";

import Link from "next/link";

import { AppShell, expertNav } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { vacancy } from "@/lib/demo/vacancies";

export default function ExpertTasksPage() {
  return (
    <AppShell nav={expertNav()} title="Мои задачи">
      <main className="workspace">
        <PageHeader
          path="Эксперт"
          title="Мои задачи"
          description={<PilotBadge />}
        />
        <section className="form-surface form-panel">
          <h2>Калибровка</h2>
          <p>
            {vacancy.title} · статус На проверке · поступило 2 сентября
          </p>
          <Button asChild>
            <Link href={`/vacancies/${vacancy.id}/rubric`}>Открыть</Link>
          </Button>
        </section>
        <section className="form-surface form-panel">
          <h2>Аудит</h2>
          <p>Middle+ Python · 5 отчётов ждут проверки · ~20 минут</p>
          <Button asChild variant="secondary">
            <Link href={`/audit/${vacancy.id}`}>Открыть аудит</Link>
          </Button>
        </section>
        <section className="form-surface form-panel">
          <h2>Утверждение</h2>
          <p>Рубрика v2 ждёт утверждения.</p>
          <Button asChild variant="secondary">
            <Link href={`/vacancies/${vacancy.id}/approve`}>Открыть утверждение</Link>
          </Button>
        </section>
      </main>
    </AppShell>
  );
}
