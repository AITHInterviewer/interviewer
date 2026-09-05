"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, Clock } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { CandidateGate } from "@/components/chrome/CandidateGate";
import { Button } from "@/components/ui/button";
import { isResumeOffered, markForwardProgress, routeParam } from "@/lib/candidate-flow";

export default function InvitationPage() {
  const token = routeParam(useParams<{ token: string }>().token);
  const [progressError, setProgressError] = useState<string | null>(null);

  return (
    <CandidateGate token={token} current="Приглашение" redirectCompleted>
      {(info, accessToken) => (
        <InvitationBody
          token={accessToken}
          vacancyTitle={info.vacancy_title}
          questionsTotal={info.questions_total}
          duration={info.estimated_duration_min}
          offerResume={isResumeOffered(info)}
          progressError={progressError}
          onOpenedError={setProgressError}
        />
      )}
    </CandidateGate>
  );
}

function InvitationBody({
  token,
  vacancyTitle,
  questionsTotal,
  duration,
  offerResume,
  progressError,
  onOpenedError,
}: {
  token: string;
  vacancyTitle: string;
  questionsTotal: number;
  duration: { min: number; max: number };
  offerResume: boolean;
  progressError: string | null;
  onOpenedError: (message: string | null) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    markForwardProgress(token, "opened").catch(() => {
      if (!cancelled) {
        onOpenedError(
          "Не получилось отметить открытие ссылки. Саму ссылку это не ломает — можно начинать.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, onOpenedError]);

  return (
    <section className="candidate-intro">
      <p className="path">Приглашение</p>
      <h1>Вас пригласили на интервью</h1>
      <p>
        Вакансия: {vacancyTitle}. Сначала коротко объясним, как всё устроено, затем можно перейти к
        разговору в браузере.
      </p>
      <div className="interview-facts">
        <span>
          <Check size={18} />
          {questionsTotal} основных вопросов
        </span>
        <span>
          <Clock size={18} />
          примерно {duration.min}–{duration.max} минут
        </span>
      </div>
      {offerResume ? (
        <p>
          Похоже, вы уже начинали. Можно вернуться к тому же интервью по ссылке «Продолжить».
        </p>
      ) : null}
      <div className="candidate-actions" style={{ marginTop: 28 }}>
        {offerResume ? (
          <Button asChild size="large">
            <Link href={`/i/${token}/resume`}>Продолжить</Link>
          </Button>
        ) : null}
        <Button asChild size="large" variant={offerResume ? "secondary" : "primary"}>
          <Link href={`/i/${token}/consent`}>Начать</Link>
        </Button>
      </div>
      {progressError ? <p className="field__error">{progressError}</p> : null}
    </section>
  );
}
