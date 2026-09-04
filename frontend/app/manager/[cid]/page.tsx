"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Play } from "@phosphor-icons/react";
import { useState, useSyncExternalStore } from "react";

import { AppShell, managerNav } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { HumanNote } from "@/components/evidence/AiNote";
import { Button } from "@/components/ui/button";
import { getCandidateById } from "@/lib/demo/candidates";
import { getRequirement } from "@/lib/demo/rubric";
import { readStore } from "@/lib/demo/recruiter-store";
import { vacancy } from "@/lib/demo/vacancies";

function subscribe() {
  return () => undefined;
}

export default function ManagerBriefPage() {
  const params = useParams<{ cid: string }>();
  const candidate = getCandidateById(params.cid);
  const [decision, setDecision] = useState("");
  const [note, setNote] = useState("");
  const last = useSyncExternalStore(
    subscribe,
    () => (candidate ? readStore().decisions[candidate.id]?.at(-1) : undefined),
    () => undefined,
  );

  if (!candidate) {
    return (
      <AppShell nav={managerNav()} title="Менеджер">
        <main className="workspace">
          <ScreenState
            kind="error"
            title="Кандидат не найден"
            text="Такой карточки к встрече в демо нет. Откройте список или вход."
            action={
              <Button asChild variant="secondary">
                <Link href="/manager">К встречам</Link>
              </Button>
            }
          />
        </main>
      </AppShell>
    );
  }

  const confirmed = candidate.report
    .filter((item) => item.status === "Подтверждено")
    .map((item) => getRequirement(item.requirementId)?.title)
    .filter(Boolean);
  const talkAbout = candidate.report
    .filter((item) => item.status === "Недостаточно данных" || item.status === "Частично" || item.status === "Не проверено")
    .slice(0, 4);

  return (
    <AppShell nav={managerNav()} title="Перед встречей">
      <main className="manager-brief">
        <PageHeader
          path={`${candidate.name} · ${vacancy.title}`}
          title={candidate.name}
          description={
            <>
              Рекрутер {vacancy.recruiterName}: передаёт
              {last ? ` · ${last.kind}` : ""}.
              {last?.comment ? ` Комментарий: ${last.comment}` : ""}
            </>
          }
          actions={
            <button className="text-button no-print" type="button" onClick={() => window.print()}>
              Печать
            </button>
          }
        />
        {last ? (
          <HumanNote label={`Решение: ${last.author}, ${last.at}`}>
            {last.kind}
          </HumanNote>
        ) : null}
        <section className="meeting-sheet">
          <div className="meeting-confirmed">
            <h2>Подтверждено - можно не проверять повторно</h2>
            <p>{confirmed.join(", ") || "Пока нет"}</p>
          </div>
          <div className="meeting-topics">
            <h2>О чём стоит поговорить</h2>
            <ol>
              {talkAbout.map((item) => {
                const req = getRequirement(item.requirementId);
                return (
                  <li key={item.requirementId}>
                    <div>
                      <strong>
                        {req?.title} · {item.status}
                      </strong>
                      <p>{item.whyStatus}</p>
                      {item.timecode && item.quoteFoundInTranscript ? (
                        <button className="time-link" type="button">
                          <Play size={14} weight="fill" />
                          Фрагмент {item.timecode}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="meeting-strength">
            <h2>Сильная сторона для команды</h2>
            <p>{candidate.strengths[0] ?? "Смотрите отчёт рекрутера"}</p>
          </div>
          <div className="meeting-decision no-print">
            <div>
              <h2>После встречи</h2>
              <p>{decision ? `Решение: ${decision}` : "Зафиксируйте результат и расхождение с отчётом."}</p>
              <textarea
                style={{ marginTop: 10 }}
                placeholder="Что не совпало с отчётом"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div>
              {["Берём", "Ещё этап", "Нет"].map((item) => (
                <button
                  key={item}
                  type="button"
                  data-active={decision === item}
                  onClick={() => setDecision(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
