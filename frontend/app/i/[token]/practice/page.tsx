"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Microphone } from "@phosphor-icons/react";
import { useState } from "react";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { LaptopGate } from "@/components/chrome/LaptopGate";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { practiceQuestion } from "@/lib/demo/rubric";
import { updateSession } from "@/lib/demo/session";

export default function PracticePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const candidate = getCandidateByToken(params.token);
  const [phase, setPhase] = useState<"idle" | "done">("idle");

  if (!candidate) {
    return (
      <main className="workspace">
        <ScreenState
          kind="error"
          title="Ссылка не найдена"
          text="Такого приглашения в демо нет. Вернитесь ко входу и выберите роль кандидата."
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
    <LaptopGate>
      <CandidateShell step="Тренировка">
        <section className="setup-stage" style={{ width: "100%" }}>
          <span className="status" data-tone="warning">
            Тренировка - не оценивается и не сохраняется в отчёт
          </span>
          <h1>{practiceQuestion.text}</h1>
          <p>
            <strong>Что раскрыть:</strong> {practiceQuestion.structureHint}
          </p>
          {phase === "idle" ? (
            <div className="practice-row">
              <Button type="button" onClick={() => setPhase("done")}>
                <Microphone size={18} />
                Записать тренировочный ответ
              </Button>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  updateSession(candidate.token, { practiceDone: true });
                  router.push(`/i/${candidate.token}/q/1`);
                }}
              >
                Пропустить тренировку
              </button>
            </div>
          ) : (
            <>
              <p style={{ marginTop: 24 }}>Так будет выглядеть каждый ответ.</p>
              <div className="practice-row">
                <Button
                  type="button"
                  onClick={() => {
                    updateSession(candidate.token, { practiceDone: true });
                    router.push(`/i/${candidate.token}/q/1`);
                  }}
                >
                  К первому вопросу
                  <ArrowRight size={17} />
                </Button>
              </div>
            </>
          )}
          <div className="setup-stage__footer">
            <Button asChild variant="text">
              <Link href={`/i/${candidate.token}/rules`}>Назад</Link>
            </Button>
          </div>
        </section>
      </CandidateShell>
    </LaptopGate>
  );
}
