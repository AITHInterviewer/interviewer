"use client";

import { useParams } from "next/navigation";
import { CheckCircle } from "@phosphor-icons/react";

import { AppShell, expertNav } from "@/components/chrome/AppShell";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { getVacancy } from "@/lib/demo/vacancies";

export default function ApprovePage() {
  const params = useParams<{ id: string }>();
  const vacancy = getVacancy(params.id);

  if (!vacancy) {
    return (
      <AppShell nav={expertNav()} title="Утверждение">
        <main className="workspace">
          <h1>Вакансия не найдена</h1>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell nav={expertNav()} title="Утверждение">
      <main className="workspace workspace--form">
        <header className="page-title">
          <div>
            <p className="path">{vacancy.title}</p>
            <h1>Утверждение версии 2</h1>
            <PilotBadge />
          </div>
          <Button type="button" disabled>
            Утвердить v2
          </Button>
        </header>
        <div className="approval-success">
          <CheckCircle size={19} weight="fill" />
          В демо рубрика утверждена заранее
        </div>
        <section className="diff-surface">
          <div className="diff-head">
            <span>Изменение</span>
            <span>Версия 1</span>
            <span>Версия 2</span>
          </div>
          <div className="diff-row">
            <strong>Разбор инцидента</strong>
            <p>Описывает причину и исправление</p>
            <p>Описывает причину, личный вклад и проверку результата</p>
          </div>
          <div className="diff-row">
            <strong>Celery</strong>
            <p>Желательное</p>
            <p>Обязательное, нужно покрыть вопросом</p>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
