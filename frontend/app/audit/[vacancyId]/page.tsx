"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Play } from "@phosphor-icons/react";
import { useState } from "react";

import { AppShell, expertNav } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { AiNote } from "@/components/evidence/AiNote";
import { ToastStack } from "@/components/evidence/Drawer";
import { StatusBadge } from "@/components/evidence/StatusBadge";
import { Button } from "@/components/ui/button";
import { getVacancy } from "@/lib/demo/vacancies";

export default function AuditPage() {
  const params = useParams<{ vacancyId: string }>();
  const vacancy = getVacancy(params.vacancyId);
  const [answer, setAnswer] = useState("");
  const [toasts, setToasts] = useState<string[]>([]);

  function toast(message: string) {
    setToasts((current) => [...current, message]);
    window.setTimeout(() => setToasts((current) => current.slice(1)), 3500);
  }

  if (!vacancy) {
    return (
      <AppShell nav={expertNav()} title="Аудит">
        <main className="workspace">
          <ScreenState
            kind="error"
            title="Вакансия не найдена"
            text="Аудит для этой вакансии в демо недоступен."
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
    <AppShell nav={expertNav()} title="Аудит">
      <main className="workspace workspace--form">
        <PageHeader
          path="Контроль качества"
          title="Аудит отчёта"
          description={
            <>
              Аудит · {vacancy.title} v2 · отчёт 3 из 5 · требование 2 из 8 · Кандидат #17. <PilotBadge />
            </>
          }
          actions={
            <div className="audit-nav">
              <button className="icon-button" type="button" onClick={() => toast("В пилоте это макет")}>
                <ArrowLeft size={18} />
              </button>
              <button className="icon-button" type="button" onClick={() => toast("В пилоте это макет")}>
                <ArrowRight size={18} />
              </button>
            </div>
          }
        />
        <section className="audit-compare">
          <div>
            <span className="column-label">Ответ кандидата</span>
            <blockquote>
              «Оказалось, что соединения к базе не закрывались в воркерах. Добавили контекстный менеджер, и всё
              починилось»
            </blockquote>
            <button className="time-link" type="button" onClick={() => toast("В пилоте это макет")}>
              <Play size={15} weight="fill" />
              Открыть 14:22
            </button>
          </div>
          <div>
            <span className="column-label">Вывод системы</span>
            <StatusBadge status="Частично" />
            <AiNote>
              <p>Причина и исправление описаны. Способ проверки после исправления не назван.</p>
            </AiNote>
          </div>
        </section>
        <section className="audit-form">
          <fieldset className="audit-question">
            <legend>Согласны с выводом?</legend>
            <div>
              {["Да", "Нет", "Спорно"].map((option) => (
                <button
                  type="button"
                  key={option}
                  data-active={answer === option}
                  onClick={() => setAnswer(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="audit-submit">
            <span>{answer ? `Выбрано: ${answer}` : "Ответьте на первый вопрос"}</span>
            <Button
              type="button"
              disabled={!answer}
              onClick={() => toast("В пилоте это макет")}
            >
              Сохранить аудит
            </Button>
          </div>
        </section>
        <ToastStack messages={toasts} />
      </main>
    </AppShell>
  );
}
