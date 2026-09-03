"use client";

import { useParams } from "next/navigation";

import { AppShell, recruiterNav } from "@/components/chrome/AppShell";
import { PilotBadge, VersionTag } from "@/components/chrome/VersionTag";
import { getVacancy } from "@/lib/demo/vacancies";

export default function VacancySettingsPage() {
  const params = useParams<{ id: string }>();
  const vacancy = getVacancy(params.id);

  if (!vacancy) {
    return (
      <AppShell nav={recruiterNav()} title="Настройки">
        <main className="workspace">
          <h1>Вакансия не найдена</h1>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell nav={recruiterNav()} title="Настройки вакансии">
      <main className="workspace workspace--form">
        <header className="page-title">
          <div>
            <p className="path">{vacancy.title}</p>
            <h1>Настройка и версии</h1>
            <PilotBadge />
          </div>
        </header>
        <section className="form-surface" style={{ border: "1px solid var(--border)", borderRadius: 12 }}>
          <h2>Общее</h2>
          <p>Название: {vacancy.title}</p>
          <p>Грейд: {vacancy.grade}</p>
          <p>Эксперт: {vacancy.expertName}</p>
          <p>Менеджер: {vacancy.managerName}</p>
          <p>
            <VersionTag />
          </p>
        </section>
        <section className="form-surface" style={{ border: "1px solid var(--border)", borderRadius: 12, marginTop: 16 }}>
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
        <section className="form-surface" style={{ border: "1px solid var(--border)", borderRadius: 12, marginTop: 16 }}>
          <h2>Письма</h2>
          <p>Шаблоны приглашения, напоминания и запроса доп. ответа - макет пилота.</p>
        </section>
      </main>
    </AppShell>
  );
}
