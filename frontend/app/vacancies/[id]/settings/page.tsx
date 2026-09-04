"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { AppShell, recruiterNav } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { PilotBadge, VersionTag } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { getVacancy } from "@/lib/demo/vacancies";

export default function VacancySettingsPage() {
  const params = useParams<{ id: string }>();
  const vacancy = getVacancy(params.id);

  if (!vacancy) {
    return (
      <AppShell nav={recruiterNav()} title="Настройки">
        <main className="workspace">
          <ScreenState
            kind="error"
            title="Вакансия не найдена"
            text="Такой вакансии в демо нет. Вернитесь к списку."
            action={
              <Button asChild variant="secondary">
                <Link href="/vacancies">К вакансиям</Link>
              </Button>
            }
          />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell nav={recruiterNav()} title="Настройки вакансии">
      <main className="workspace workspace--form">
        <PageHeader
          path={vacancy.title}
          title="Настройка и версии"
          description={<PilotBadge />}
          actions={
            <Button asChild variant="secondary">
              <Link href={`/vacancies/${vacancy.id}`}>К доске</Link>
            </Button>
          }
        />
        <section className="form-surface form-panel">
          <h2>Общее</h2>
          <p>Название: {vacancy.title}</p>
          <p>Грейд: {vacancy.grade}</p>
          <p>Эксперт: {vacancy.expertName}</p>
          <p>Менеджер: {vacancy.managerName}</p>
          <p>
            <VersionTag demoNote />
          </p>
        </section>
        <section className="form-surface form-panel">
          <h2>Версии</h2>
          <table className="vacancies-table">
            <thead>
              <tr>
                <th>Версия</th>
                <th>Дата</th>
                <th>Кто утвердил</th>
                <th>Кандидатов</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>v2</td>
                <td>3 сентября</td>
                <td>Алексей С.</td>
                <td>3</td>
              </tr>
              <tr>
                <td>v1</td>
                <td>20 августа</td>
                <td>Алексей С.</td>
                <td>0</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="form-surface form-panel">
          <h2>Письма</h2>
          <p>Шаблоны приглашения, напоминания и запроса доп. ответа — макет пилота.</p>
          <p className="pilot-hint">В пилоте это макет. Редактирование писем появится после пилота.</p>
        </section>
      </main>
    </AppShell>
  );
}
