"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { CandidateShell } from "@/components/chrome/CandidateShell";
import { LaptopGate } from "@/components/chrome/LaptopGate";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { readSession, updateSession } from "@/lib/demo/session";

export default function ResumePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const candidate = getCandidateByToken(params.token);
  const question =
    typeof window !== "undefined" && candidate
      ? readSession(candidate.token).currentQuestion || 1
      : 1;

  if (!candidate) return null;

  return (
    <LaptopGate>
      <CandidateShell step="Вопросы 1-5">
        <section className="setup-stage" style={{ width: "100%" }}>
          <h1>Продолжить интервью</h1>
          <p>
            Вы остановились на вопросе {question} из 5. Ответы на предыдущие вопросы сохранены.
          </p>
          <p>
            Если запись текущего вопроса оборвалась - его нужно записать заново. Это не считается
            перезаписью.
          </p>
          <div className="setup-stage__footer">
            <Button
              type="button"
              onClick={() => {
                updateSession(candidate.token, { interrupted: false });
                router.push(`/i/${candidate.token}/q/${question}`);
              }}
            >
              Продолжить
              <ArrowRight size={17} />
            </Button>
          </div>
        </section>
      </CandidateShell>
    </LaptopGate>
  );
}
