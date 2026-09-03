"use client";

import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Play } from "@phosphor-icons/react";
import { useState } from "react";

import { AppShell, expertNav } from "@/components/chrome/AppShell";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { AiNote } from "@/components/evidence/AiNote";
import { StatusBadge } from "@/components/evidence/StatusBadge";
import { Button } from "@/components/ui/button";
import { getVacancy } from "@/lib/demo/vacancies";

export default function AuditPage() {
  const params = useParams<{ vacancyId: string }>();
  const vacancy = getVacancy(params.vacancyId);
  const [answer, setAnswer] = useState("");

  if (!vacancy) {
    return (
      <AppShell nav={expertNav()} title="Аудит">
        <main className="workspace">
          <h1>Вакансия не найдена</h1>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell nav={expertNav()} title="Аудит">
      <main className="workspace workspace--form">
        <header className="page-title">
          <div>
            <p className="path">Контроль качества</p>
            <h1>Аудит отчёта</h1>
            <p className="page-title__description">
              Аудит · {vacancy.title} v2 · отчёт 3 из 5 · требование 2 из 8 · Кандидат #17
            </p>
            <PilotBadge />
          </div>
          <div className="audit-nav">
            <button className="icon-button" type="button">
              <ArrowLeft size={18} />
            </button>
            <button className="icon-button" type="button">
              <ArrowRight size={18} />
            </button>
          </div>
        </header>
        <section className="audit-compare">
          <div>
            <span className="column-label">Ответ кандидата</span>
            <blockquote>
              «Оказалось, что соединения к базе не закрывались в воркерах. Добавили контекстный менеджер, и всё
              починилось»
            </blockquote>
            <button className="time-link" type="button">
              <Play size={15} weight="fill" />
              Открыть 14:22
            </button>
          </div>
          <div>
            <span className="column-label">Вывод системы</span>
            <StatusBadge status="Частично" />
            <AiNote>
              <p style={{ fontSize: 13 }}>
                Причина и исправление описаны. Способ проверки после исправления не назван.
              </p>
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
            <Button type="button" disabled={!answer}>
              Сохранить аудит
            </Button>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
