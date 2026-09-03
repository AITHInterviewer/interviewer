"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CaretRight, Copy, PaperPlaneTilt, Plus } from "@phosphor-icons/react";
import { useState } from "react";

import { AppShell, recruiterNav } from "@/components/chrome/AppShell";
import { VersionTag } from "@/components/chrome/VersionTag";
import { Modal, ToastStack } from "@/components/evidence/Drawer";
import { Button } from "@/components/ui/button";
import { candidates, inviteTokenFromName } from "@/lib/demo/candidates";
import { emptyStore, pushToast, readStore, writeStore } from "@/lib/demo/recruiter-store";
import { getVacancy } from "@/lib/demo/vacancies";

type ColumnId = "invited" | "progress" | "processing" | "ready" | "decided";

const COLUMNS: Array<{ id: ColumnId; title: string }> = [
  { id: "invited", title: "Приглашены" },
  { id: "progress", title: "Проходят" },
  { id: "processing", title: "Обработка" },
  { id: "ready", title: "Отчёт готов" },
  { id: "decided", title: "Решено" },
];

export default function VacancyBoardPage() {
  const params = useParams<{ id: string }>();
  const vacancy = getVacancy(params.id);
  const [view, setView] = useState<"board" | "list">("board");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toasts, setToasts] = useState<string[]>([]);
  const [name, setName] = useState("Александр");
  const [email, setEmail] = useState("alexander@example.com");
  const [store, setStore] = useState(() => (typeof window !== "undefined" ? readStore() : emptyStore()));

  function refreshStore() {
    setStore(readStore());
  }

  if (!vacancy) {
    return (
      <AppShell nav={recruiterNav()} title="Вакансия">
        <main className="workspace">
          <h1>Вакансия не найдена</h1>
        </main>
      </AppShell>
    );
  }

  const readySorted = [...candidates].sort((a, b) => {
    const order = { "Недостаточно данных": 0, Соответствует: 1, "Не соответствует": 2 } as const;
    return order[a.systemRecommendation] - order[b.systemRecommendation];
  });

  const decidedIds = Object.keys(store.decisions).filter((id) => (store.decisions[id] ?? []).length > 0);
  const ready = readySorted.filter((c) => !decidedIds.includes(c.id));
  const decided = readySorted.filter((c) => decidedIds.includes(c.id));

  function showToast(message: string) {
    pushToast(message);
    setToasts((current) => [...current, message]);
    window.setTimeout(() => setToasts((current) => current.slice(1)), 3500);
  }

  return (
    <AppShell nav={recruiterNav()} title={vacancy.title}>
      <main className="workspace workspace--wide">
        <header className="page-title">
          <div>
            <p className="path">Вакансии / {vacancy.title}</p>
            <h1>Кандидаты</h1>
            <p className="page-title__description">
              {vacancy.grade}, статус {vacancy.status}. <VersionTag />
            </p>
          </div>
          <div className="page-actions">
            <Button type="button" onClick={() => setInviteOpen(true)} disabled={vacancy.status !== "Активна"}>
              <Plus size={18} />
              Пригласить кандидата
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/vacancies/${vacancy.id}/settings`}>⋯ Настройки</Link>
            </Button>
          </div>
        </header>

        <div className="board-toolbar">
          <div className="vacancy-state">
            <span className="live-dot" />
            Приём ответов открыт
          </div>
          <div className="density-switch" aria-label="Вид">
            <button type="button" data-active={view === "board"} onClick={() => setView("board")}>
              Доска
            </button>
            <button type="button" data-active={view === "list"} onClick={() => setView("list")}>
              Список
            </button>
          </div>
          <span className="board-toolbar__ats">Эксперт: {vacancy.expertName}</span>
        </div>

        {view === "board" ? (
          <section className="kanban" aria-label="Кандидаты по этапам">
            {COLUMNS.map((column) => {
              const items =
                column.id === "invited"
                  ? store.invited.map((item) => ({
                      id: item.id,
                      name: item.name,
                      detail: `До ${item.deadline}`,
                      meta: "Письмо имитировано",
                      href: undefined as string | undefined,
                      tone: "neutral",
                    }))
                  : column.id === "ready"
                    ? ready.map((item) => ({
                        id: item.id,
                        name: item.name,
                        detail: item.systemRecommendation,
                        meta: `обязательных ${item.mandatoryCovered.confirmed}/${item.mandatoryCovered.total}`,
                        href: `/vacancies/${vacancy.id}/candidates/${item.id}`,
                        tone:
                          item.systemRecommendation === "Соответствует"
                            ? "positive"
                            : item.systemRecommendation === "Не соответствует"
                              ? "danger"
                              : "warning",
                      }))
                    : column.id === "decided"
                      ? decided.map((item) => {
                          const last = store.decisions[item.id]?.at(-1);
                          return {
                            id: item.id,
                            name: item.name,
                            detail: last?.kind ?? "Решение принято",
                            meta: last?.at ?? "",
                            href: `/vacancies/${vacancy.id}/candidates/${item.id}`,
                            tone: "neutral",
                          };
                        })
                      : [];
              return (
                <div className="kanban-column" key={column.id}>
                  <div className="kanban-column__header">
                    <h2>{column.title}</h2>
                    <span>{items.length}</span>
                  </div>
                  <div className="candidate-stack">
                    {items.length === 0 ? (
                      <p style={{ color: "var(--ink-tertiary)", fontSize: 12 }}>Пока пусто</p>
                    ) : (
                      items.map((item) =>
                        item.href ? (
                          <Link
                            key={item.id}
                            href={item.href}
                            className="candidate-card candidate-card--interactive"
                            data-tone={item.tone}
                            style={{ textDecoration: "none", color: "inherit" }}
                          >
                            <div className="candidate-card__top">
                              <strong>{item.name}</strong>
                              <CaretRight size={16} />
                            </div>
                            <p>{item.detail}</p>
                            <div className="candidate-card__meta">
                              <span>{item.meta}</span>
                            </div>
                          </Link>
                        ) : (
                          <article className="candidate-card" data-tone={item.tone} key={item.id}>
                            <div className="candidate-card__top">
                              <strong>{item.name}</strong>
                            </div>
                            <p>{item.detail}</p>
                            <div className="candidate-card__meta">
                              <span>{item.meta}</span>
                            </div>
                          </article>
                        ),
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ) : (
          <table className="vacancies-table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Рекомендация</th>
                <th>Обязательные</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {readySorted.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.systemRecommendation}</td>
                  <td>
                    {item.mandatoryCovered.confirmed}/{item.mandatoryCovered.total}
                  </td>
                  <td>
                    <Link href={`/vacancies/${vacancy.id}/candidates/${item.id}`}>Открыть отчёт</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>

      <Modal open={inviteOpen} title="Пригласить кандидата" onClose={() => setInviteOpen(false)}>
        <div className="split-form">
          <form
            className="form-surface"
            onSubmit={(event) => {
              event.preventDefault();
              const token = inviteTokenFromName(name);
              const storeNow = readStore();
              writeStore({
                ...storeNow,
                invited: [
                  ...storeNow.invited.filter((item) => item.id !== token),
                  { id: token, name, email, deadline: "8 сентября" },
                ],
              });
              refreshStore();
              showToast("Письмо отправлено");
              setInviteOpen(false);
            }}
          >
            <label>
              Имя кандидата
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Пройти до
              <input type="date" defaultValue="2026-09-08" />
            </label>
            <label>
              Рекрутер
              <input defaultValue={vacancy.recruiterName} />
            </label>
            <div className="form-actions">
              <Button type="submit">
                <PaperPlaneTilt size={18} />
                Отправить приглашение
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  const token = inviteTokenFromName(name);
                  const storeNow = readStore();
                  writeStore({
                    ...storeNow,
                    invited: [
                      ...storeNow.invited.filter((item) => item.id !== token),
                      { id: token, name, email, deadline: "8 сентября" },
                    ],
                  });
                  refreshStore();
                  await navigator.clipboard.writeText(`${window.location.origin}/i/${token}`);
                  showToast("Ссылка скопирована");
                }}
              >
                <Copy size={18} />
                Скопировать ссылку
              </Button>
            </div>
          </form>
          <aside className="mail-preview">
            <span className="mail-preview__label">Так письмо увидит кандидат</span>
            <h2>
              {name}, приглашаем на технический этап
            </h2>
            <p>
              Вас ждут 5 вопросов по вакансии {vacancy.title}. Интервью займёт около 25 минут, пройти его
              можно до 8 сентября.
            </p>
            <dl>
              <div>
                <dt>Следующий контакт</dt>
                <dd>
                  {vacancy.recruiterName} до 12 сентября
                </dd>
              </div>
              <div>
                <dt>Нужен</dt>
                <dd>Ноутбук с микрофоном</dd>
              </div>
            </dl>
          </aside>
        </div>
      </Modal>
      <ToastStack messages={toasts} />
    </AppShell>
  );
}
