"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { ScreenState } from "@/components/chrome/ScreenState";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { vacancy } from "@/lib/demo/vacancies";

export default function RequestPage() {
  const params = useParams<{ token: string }>();
  const candidate = getCandidateByToken(params.token);
  const [sent, setSent] = useState(false);
  const [kind, setKind] = useState<"delete" | "review">("review");

  if (!candidate) {
    return (
      <main className="workspace">
        <ScreenState
          kind="error"
          title="Запрос недоступен"
          text="Такого интервью в демо нет. Вернитесь ко входу."
          action={
            <Button asChild variant="secondary">
              <Link href="/login">К выбору роли</Link>
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <CandidateShell step="Готово">
      <PilotBadge />
      <section className="setup-stage setup-stage--full">
        <h1>Запрос</h1>
        {sent ? (
          <p>
            Запрос передан {vacancy.recruiterName}. Срок ответа - 7 дней.
          </p>
        ) : (
          <>
            <div className="density-switch">
              <button type="button" data-active={kind === "delete"} onClick={() => setKind("delete")}>
                Удалить мои данные
              </button>
              <button type="button" data-active={kind === "review"} onClick={() => setKind("review")}>
                Пересмотреть результат
              </button>
            </div>
            <label className="field-block">
              Комментарий
              <textarea placeholder="Кратко опишите запрос" />
            </label>
            <div className="form-actions">
              <Button type="button" onClick={() => setSent(true)}>
                Отправить
              </Button>
            </div>
          </>
        )}
        <Button asChild variant="text">
          <Link href={`/i/${candidate.token}/done`}>Назад</Link>
        </Button>
      </section>
    </CandidateShell>
  );
}
