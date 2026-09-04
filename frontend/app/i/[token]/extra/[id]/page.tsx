"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { ScreenState } from "@/components/chrome/ScreenState";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { vacancy } from "@/lib/demo/vacancies";

export default function ExtraAnswerPage() {
  const params = useParams<{ token: string; id: string }>();
  const candidate = getCandidateByToken(params.token);

  if (!candidate) {
    return (
      <main className="workspace">
        <ScreenState
          kind="error"
          title="Ссылка не найдена"
          text="Дополнительного вопроса с таким адресом в демо нет."
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
    <CandidateShell step="Вопросы 1-5">
      <PilotBadge />
      <section className="setup-stage setup-stage--full">
        <p className="path">Дополнительный вопрос от {vacancy.recruiterName}</p>
        <h1>Как вы проверяли результат фикса после инцидента?</h1>
        <p>Хочу лучше понять, как вы проверяли результат фикса. Один вопрос, около 2 минут.</p>
        <div className="practice-row">
          <Button type="button" disabled>
            Записать ответ
          </Button>
          <Button type="button" variant="secondary" disabled>
            Проверить микрофон
          </Button>
        </div>
        <p className="pilot-hint">В пилоте это макет. Запись ответа появится после пилота.</p>
        <Button asChild variant="text">
          <Link href={`/i/${candidate.token}/done`}>Назад к итогу</Link>
        </Button>
      </section>
    </CandidateShell>
  );
}
