"use client";

import Link from "next/link";
import { CaretRight, Copy, PaperPlaneTilt, Plus } from "@phosphor-icons/react";
import { useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { VersionTag } from "@/components/chrome/VersionTag";
import { Modal, ToastStack } from "@/components/evidence/Drawer";
import { Button } from "@/components/ui/button";
import { buildNav } from "@/lib/nav";
import { candidates, inviteTokenFromName } from "@/lib/demo/candidates";
import { PIPELINE_COLUMNS, listPipelineCards } from "@/lib/demo/pipeline";
import { emptyStore, pushToast, readStore, writeStore } from "@/lib/demo/recruiter-store";
import type { PipelineCard } from "@/lib/demo/types";
import { vacancy } from "@/lib/demo/vacancies";

function mergeBoardCards(store: ReturnType<typeof readStore>): PipelineCard[] {
  const decidedIds = new Set(
    Object.keys(store.decisions).filter((id) => (store.decisions[id] ?? []).length > 0),
  );
  const fromSeed = listPipelineCards().map((card) => {
    if (card.canonical && decidedIds.has(card.id)) {
      const last = store.decisions[card.id]?.at(-1);
      return {
        ...card,
        stage: "decided" as const,
        stageLine: last ? `Решение: ${last.kind}` : card.stageLine,
        decisionLabel: last?.kind ?? card.decisionLabel,
      };
    }
    return { ...card };
  });
  const seedIds = new Set(fromSeed.map((card) => card.id));
  const extraInvited = store.invited
    .filter((item) => !seedIds.has(item.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      stage: "invited" as const,
      stageLine: `Письмо имитировано, пройти до ${item.deadline}`,
      canonical: false,
    }));
  return [...fromSeed, ...extraInvited];
}

function cardTone(card: PipelineCard): string {
  if (card.stage !== "reportReady" || !card.canonical) return "neutral";
  const person = candidates.find((item) => item.id === card.id);
  if (person?.systemRecommendation === "Соответствует") return "positive";
  if (person?.systemRecommendation === "Не соответствует") return "danger";
  if (person?.systemRecommendation === "Недостаточно данных") return "warning";
  return "neutral";
}

function reportHref(card: PipelineCard): string | undefined {
  if (card.canonical && card.stage === "reportReady") {
    return `/vacancies/demo/candidates/${card.id}`;
  }
  return undefined;
}

export default function VacancyBoardPage() {
  const { landing, loading } = useProtectedLanding();
  const [view, setView] = useState<"board" | "list">("board");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toasts, setToasts] = useState<string[]>([]);
  const [name, setName] = useState("Александр");
  const [email, setEmail] = useState("alexander@example.com");
  const [store, setStore] = useState(() => (typeof window !== "undefined" ? readStore() : emptyStore()));

  function refreshStore() {
    setStore(readStore());
  }

  function showToast(message: string) {
    pushToast(message);
    setToasts((current) => [...current, message]);
    window.setTimeout(() => setToasts((current) => current.slice(1)), 3500);
  }

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Loading" text="Checking your session..." />
      </main>
    );
  }

  const nav = buildNav(landing, { includeDemo: true });
  const boardCards = mergeBoardCards(store);
  const inviteDisabled = vacancy.status !== "Активна";

  return (
    <AppShell nav={nav} title={vacancy.title}>
      <main className="workspace workspace--wide">
        <PageHeader
          path={`Вакансии / ${vacancy.title}`}
          title="Кандидаты"
          description={`${vacancy.grade}, статус ${vacancy.status}.`}
          actions={
            <Button type="button" onClick={() => setInviteOpen(true)} disabled={inviteDisabled}>
              <Plus size={18} />
              Пригласить кандидата
            </Button>
          }
        />
        {inviteDisabled ? (
          <p className="disabled-hint">Пригласить нельзя: вакансия не в статусе «Активна».</p>
        ) : null}

        <p className="board-hint">В этом демо смотрите колонку «Отчёт готов» — там Дмитрий, Никита и Лидия.</p>

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
          <span className="board-toolbar__ats demo-jargon">
            Эксперт: {vacancy.expertName}. <VersionTag demoNote />
          </span>
        </div>

        {view === "board" ? (
          <section className="kanban" aria-label="Кандидаты по этапам">
            {PIPELINE_COLUMNS.map((column) => {
              const items = boardCards.filter((card) => card.stage === column.stage);
              return (
                <div className="kanban-column" key={column.columnId}>
                  <div className="kanban-column__header">
                    <h2>{column.title}</h2>
                    <span>{items.length}</span>
                  </div>
                  <div className="candidate-stack">
                    {items.map((item) => {
                      const href = reportHref(item);
                      const tone = cardTone(item);
                      const body = (
                        <>
                          <div className="candidate-card__top">
                            <strong>{item.name}</strong>
                            {href ? <CaretRight size={16} /> : null}
                          </div>
                          <p>{item.decisionLabel ?? item.stageLine}</p>
                          {href ? (
                            <div className="candidate-card__meta">
                              <span>Открыть отчёт</span>
                            </div>
                          ) : item.decisionLabel && item.stageLine && item.stageLine !== item.decisionLabel ? (
                            <div className="candidate-card__meta">
                              <span>{item.stageLine}</span>
                            </div>
                          ) : null}
                        </>
                      );
                      return href ? (
                        <Link
                          key={item.id}
                          href={href}
                          className="candidate-card candidate-card--interactive"
                          data-tone={tone}
                        >
                          {body}
                        </Link>
                      ) : (
                        <article className="candidate-card" data-tone={tone} key={item.id}>
                          {body}
                        </article>
                      );
                    })}
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
                <th>Стадия</th>
                <th>Статус</th>
                <th>Отчёт</th>
              </tr>
            </thead>
            <tbody>
              {boardCards.map((item) => {
                const href = reportHref(item);
                const column = PIPELINE_COLUMNS.find((entry) => entry.stage === item.stage);
                return (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td className="pipeline-stage">{column?.title ?? item.stage}</td>
                    <td>{item.decisionLabel ?? item.stageLine}</td>
                    <td>
                      {href ? (
                        <Link href={href}>Открыть отчёт</Link>
                      ) : (
                        <span className="muted-copy">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
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
            <h2>{name}, приглашаем на технический этап</h2>
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
