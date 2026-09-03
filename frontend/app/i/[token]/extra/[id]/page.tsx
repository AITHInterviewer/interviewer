"use client";

import { useParams } from "next/navigation";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { vacancy } from "@/lib/demo/vacancies";

export default function ExtraAnswerPage() {
  const params = useParams<{ token: string; id: string }>();
  const candidate = getCandidateByToken(params.token);
  if (!candidate) return null;

  return (
    <CandidateShell step="Вопросы 1-5">
      <PilotBadge />
      <section className="setup-stage" style={{ width: "100%", marginTop: 16 }}>
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
      </section>
    </CandidateShell>
  );
}
