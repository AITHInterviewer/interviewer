"use client";

import Link from "next/link";
import { Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { AppShell, recruiterNav } from "@/components/chrome/AppShell";
import { Button } from "@/components/ui/button";
import { vacancy } from "@/lib/demo/vacancies";

const TABS = ["Активные", "Черновики", "На проверке", "Архив"] as const;

export default function VacanciesPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Активные");

  const rows = useMemo(() => {
    if (tab === "Активные") return [vacancy];
    return [];
  }, [tab]);

  return (
    <AppShell nav={recruiterNav()} title="Рекрутер">
      <main className="workspace">
        <header className="page-title">
          <div>
            <p className="path">Рекрутер</p>
            <h1>Вакансии</h1>
          </div>
          <Button asChild>
            <Link href="/vacancies/new">
              <Plus size={18} />
              Новая вакансия
            </Link>
          </Button>
        </header>
        <div className="tabs">
          {TABS.map((item) => (
            <button key={item} type="button" data-active={tab === item} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <div className="empty-state">
            <h2>Вакансий пока нет</h2>
            <p>Создайте первую - понадобится описание вакансии, 5 минут.</p>
            <Button asChild>
              <Link href="/vacancies/new">Новая вакансия</Link>
            </Button>
          </div>
        ) : (
          <table className="vacancies-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Грейд</th>
                <th>Статус</th>
                <th>Рубрика</th>
                <th>Кандидаты</th>
                <th>Эксперт</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/vacancies/${row.id}`}>{row.title}</Link>
                  </td>
                  <td>{row.grade}</td>
                  <td>{row.status}</td>
                  <td>{row.rubricVersion}</td>
                  <td>
                    {row.counts.invited}/{row.counts.inProgress}/{row.counts.reportReady}/
                    {row.counts.decided}
                  </td>
                  <td>{row.expertName}</td>
                  <td>{row.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </AppShell>
  );
}
