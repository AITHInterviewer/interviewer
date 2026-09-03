"use client";

import { useParams, useRouter } from "next/navigation";
import { CircleNotch, Microphone } from "@phosphor-icons/react";
import { useState } from "react";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { LaptopGate } from "@/components/chrome/LaptopGate";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { getQuestion } from "@/lib/demo/rubric";
import { readSession, updateSession } from "@/lib/demo/session";

export default function FollowUpPage() {
  const params = useParams<{ token: string; n: string }>();
  const router = useRouter();
  const candidate = getCandidateByToken(params.token);
  const questionIndex = Number(params.n);
  const question = getQuestion(questionIndex);
  const [mode, setMode] = useState<"idle" | "text">("idle");
  const [text, setText] = useState("");

  if (!candidate || !question) return null;

  function finish(skipped: boolean, answer?: string) {
    const session = readSession(candidate!.token);
    const isLast = questionIndex >= 5;
    updateSession(candidate!.token, {
      followUps: {
        ...session.followUps,
        [String(questionIndex)]: skipped ? { skipped: true } : { answer },
      },
      submitted: isLast ? true : session.submitted,
      interrupted: isLast ? false : session.interrupted,
    });
    router.push(isLast ? `/i/${candidate!.token}/done` : `/i/${candidate!.token}/q/${questionIndex + 1}`);
  }

  return (
    <LaptopGate>
      <CandidateShell step="Вопросы 1-5">
        <header className="question-progress">
          <span>Уточнение к вопросу {questionIndex}</span>
          <span>Короткий ответ, около минуты</span>
        </header>
        <section className="followup-stage" style={{ background: "color-mix(in srgb, var(--surface-selected) 70%, transparent)", padding: 24, borderRadius: 12 }}>
          <div className="followup-label">
            <CircleNotch size={20} />
            Нужно прояснить одну деталь
          </div>
          <h1>{question.followUpText}</h1>
          <p>Короткий ответ, около минуты. Больше уточнений к этому вопросу не будет.</p>
          {mode === "idle" ? (
            <div className="candidate-actions">
              <Button
                size="large"
                type="button"
                onClick={() => finish(false, "demo follow-up voice")}
              >
                <Microphone size={19} />
                Ответить голосом
              </Button>
              <Button variant="secondary" type="button" onClick={() => setMode("text")}>
                Ответить текстом
              </Button>
              <button className="text-button" type="button" onClick={() => finish(true)}>
                Пропустить уточнение
              </button>
            </div>
          ) : (
            <div>
              <textarea className="text-answer" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="candidate-actions" style={{ marginTop: 16 }}>
                <Button type="button" disabled={!text.trim()} onClick={() => finish(false, text)}>
                  Отправить ответ
                </Button>
                <button className="text-button" type="button" onClick={() => finish(true)}>
                  Пропустить уточнение
                </button>
              </div>
            </div>
          )}
          <small>Если пропустить, требование может остаться подтверждённым частично.</small>
        </section>
      </CandidateShell>
    </LaptopGate>
  );
}
