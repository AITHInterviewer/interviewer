"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react";

import { AppShell, expertNav, recruiterNav } from "@/components/chrome/AppShell";
import { VersionTag } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { questions, requirements } from "@/lib/demo/rubric";
import { getVacancy } from "@/lib/demo/vacancies";

export default function QuestionsPage() {
  const params = useParams<{ id: string }>();
  const vacancy = getVacancy(params.id);

  if (!vacancy) {
    return (
      <AppShell nav={expertNav()} title="Комплект">
        <main className="workspace">
          <h1>Вакансия не найдена</h1>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell nav={[...recruiterNav(), ...expertNav()]} title="Комплект вопросов">
      <main className="workspace workspace--wide">
        <header className="page-title">
          <div>
            <p className="path">Вакансии / {vacancy.title}</p>
            <h1>Комплект вопросов</h1>
            <p className="page-title__description">
              Только просмотр. <VersionTag />
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link href={`/vacancies/${vacancy.id}/rubric`}>К рубрике</Link>
          </Button>
        </header>
        <p style={{ marginBottom: 16, color: "var(--ink-tertiary)", fontSize: 13 }}>
          В демо рубрика утверждена заранее
        </p>
        <section className="coverage-matrix" style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-raised)" }}>
          <div className="section-heading">
            <div>
              <h2>Матрица покрытия</h2>
              <p>Основные вопросы одинаковы для всех кандидатов</p>
            </div>
            <span className="version-label">5 вопросов</span>
          </div>
          <div className="matrix-table">
            <div className="matrix-head">
              <span>Требование</span>
              {[1, 2, 3, 4, 5].map((value) => (
                <span key={value}>В{value}</span>
              ))}
              <span>У</span>
            </div>
            {requirements.map((row) => (
              <div className="matrix-row" key={row.id} style={{ display: "grid", gridTemplateColumns: "minmax(170px, 1fr) repeat(6, 34px)" }}>
                <span>{row.title}</span>
                {row.coverage.map((cell, index) => (
                  <i key={index} data-value={cell}>
                    {cell === 1 ? "●" : cell === 0.5 ? "◐" : "·"}
                  </i>
                ))}
                <i>{row.id === "async" || row.id === "incident" ? "◐" : "·"}</i>
              </div>
            ))}
          </div>
          <div className="coverage-warning">
            <WarningCircle size={19} weight="fill" />
            <div>
              <strong>Celery не покрывается ни одним вопросом</strong>
              <p>В демо комплект уже утверждён. Редактирование отключено.</p>
            </div>
            <Button type="button" variant="secondary" disabled>
              Добавить вопрос
            </Button>
          </div>
        </section>
        <section style={{ marginTop: 24, display: "grid", gap: 12 }}>
          {questions.map((item) => (
            <article key={item.index} className="candidate-card">
              <strong>
                В{item.index} · {item.type}
              </strong>
              <p>{item.text}</p>
              <div className="candidate-card__meta">
                <span>
                  подготовка {item.prepLimitSec / 60} мин · ответ {item.answerLimitSec / 60} мин
                </span>
                <button className="inline-action" type="button" disabled>
                  Редактировать
                </button>
              </div>
            </article>
          ))}
        </section>
        <div style={{ marginTop: 18 }}>
          <Button type="button" disabled>
            Утвердить комплект
          </Button>
        </div>
      </main>
    </AppShell>
  );
}
