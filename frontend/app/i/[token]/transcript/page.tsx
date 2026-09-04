"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { ScreenState } from "@/components/chrome/ScreenState";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";

export default function TranscriptStubPage() {
  const params = useParams<{ token: string }>();
  const candidate = getCandidateByToken(params.token);

  if (!candidate) {
    return (
      <main className="workspace">
        <ScreenState
          kind="error"
          title="Транскрипт недоступен"
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
      <section className="setup-stage setup-stage--full">
        <PilotBadge />
        <h1>Транскрипт</h1>
        <p>
          После пилота здесь появится текст ответов и правка терминов. Сейчас это заглушка: запись уже
          отправлена, править нечего.
        </p>
        <Button asChild variant="secondary">
          <Link href={`/i/${candidate.token}/done`}>Назад к «интервью отправлено»</Link>
        </Button>
      </section>
    </CandidateShell>
  );
}
