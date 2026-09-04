"use client";

import Link from "next/link";
import { Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { AppShell, recruiterNav } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import { formatVacancyCounts, vacancy } from "@/lib/demo/vacancies";

const TABS = ["Активные", "Черновики", "На проверке", "Архив"] as const;

const EMPTY_COPY: Record<(typeof TABS)[number], { title: string; text: string }> = {
  Активные: {
    title: "Вакансий пока нет",
    text: "В этом демо нет активных вакансий. Создайте новую — понадобится описание, около 5 минут.",
  },
  Черновики: {
    title: "Черновиков в этом демо нет",
    text: "В этом демо данных нет. Активная вакансия Middle+ Python — во вкладке «Активные».",
  },
  "На проверке": {
    title: "На проверке пусто",
    text: "В этом демо вакансий на проверке нет. Смотрите активную вакансию или откройте пилот утверждения.",
  },
  Архив: {
    title: "Архив пуст",
    text: "В этом демо архивных вакансий нет. Это не ошибка — архив для демо не заполняли.",
  },
};

export default function VacanciesPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Активные");

  const rows = useMemo(() => {
    if (tab === "Активные") return [vacancy];
    return [];
  }, [tab]);

  const empty = EMPTY_COPY[tab];

  return (
    <AppShell nav={recruiterNav()} title="Рекрутер">
      <main className="workspace">
        <PageHeader
          path="Рекрутер"
          title="Вакансии"
          actions={
            <Button asChild>
              <Link href="/vacancies/new">
                <Plus size={18} />
                Новая вакансия
              </Link>
            </Button>
          }
        />
        <div className="tabs">
          {TABS.map((item) => (
            <button key={item} type="button" data-active={tab === item} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <ScreenState
            kind="empty"
            title={empty.title}
            text={empty.text}
            action={
              tab === "Активные" ? (
                <Button asChild>
                  <Link href="/vacancies/new">Новая вакансия</Link>
                </Button>
              ) : (
                <Button type="button" variant="secondary" onClick={() => setTab("Активные")}>
                  К активным
                </Button>
              )
            }
          />
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
                  <td className="vacancy-counts">{formatVacancyCounts(row.counts)}</td>
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
