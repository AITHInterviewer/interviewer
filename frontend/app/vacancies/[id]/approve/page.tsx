"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle } from "@phosphor-icons/react";
import { useState } from "react";

import { AppShell, expertNav } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { ToastStack } from "@/components/evidence/Drawer";
import { Button } from "@/components/ui/button";
import { getVacancy } from "@/lib/demo/vacancies";

export default function ApprovePage() {
  const params = useParams<{ id: string }>();
  const vacancy = getVacancy(params.id);
  const [toasts, setToasts] = useState<string[]>([]);

  if (!vacancy) {
    return (
      <AppShell nav={expertNav()} title="Утверждение">
        <main className="workspace">
          <ScreenState
            kind="error"
            title="Вакансия не найдена"
            text="Такой вакансии в демо нет. Вернитесь к задачам эксперта."
            action={
              <Button asChild variant="secondary">
                <Link href="/expert">К задачам</Link>
              </Button>
            }
          />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell nav={expertNav()} title="Утверждение">
      <main className="workspace workspace--form">
        <PageHeader
          path={vacancy.title}
          title="Утверждение версии 2"
          description={<PilotBadge />}
          actions={
            <Button
              type="button"
              onClick={() => setToasts((current) => [...current, "В пилоте это макет"])}
            >
              Утвердить v2
            </Button>
          }
        />
        <p className="pilot-hint">В пилоте это макет: рубрика уже утверждена заранее.</p>
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
        <ToastStack messages={toasts} />
      </main>
    </AppShell>
  );
}
