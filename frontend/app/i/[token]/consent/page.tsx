"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { CandidateGate } from "@/components/chrome/CandidateGate";
import { Button } from "@/components/ui/button";
import { postCandidateConsent, type CandidateInterviewInfo } from "@/lib/api";
import { routeParam } from "@/lib/candidate-flow";

export default function ConsentPage() {
  const token = routeParam(useParams<{ token: string }>().token);
  const router = useRouter();

  return (
    <CandidateGate token={token} current="Согласие" redirectCompleted>
      {(info, accessToken) => (
        <ConsentBody
          token={accessToken}
          info={info}
          onContinue={() => router.push(`/i/${accessToken}/check`)}
        />
      )}
    </CandidateGate>
  );
}

function ConsentBody({
  token,
  info,
  onContinue,
}: {
  token: string;
  info: CandidateInterviewInfo;
  onContinue: () => void;
}) {
  const [agreed, setAgreed] = useState(Boolean(info.consented));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!agreed) return;
    setBusy(true);
    setError(null);
    try {
      await postCandidateConsent(token);
      onContinue();
    } catch {
      setError("Не получилось сохранить согласие. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="setup-stage" style={{ width: "100%" }}>
      <p className="path">Согласие</p>
      <h1>Как пройдёт разговор</h1>
      <p>
        Будет {info.questions_total} основных вопросов и при необходимости один уточняющий блок.
        Ориентир по времени — {info.estimated_duration_min.min}–{info.estimated_duration_min.max} минут.
      </p>
      <p>
        Ответы записываются, чтобы рекрутер по вакансии «{info.vacancy_title}» мог их посмотреть.
        Оценку и решение вы на этих страницах не увидите.
      </p>
      <label className="consent-row">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
        />
        <span>
          Соглашаюсь на запись ответов и их обработку для этой вакансии
          {info.consented ? <small>Согласие уже было отмечено ранее</small> : null}
        </span>
      </label>
      <div className="setup-stage__footer">
        <Button type="button" size="large" disabled={!agreed || busy} onClick={handleContinue}>
          {busy ? "Сохраняем…" : "Дальше, к проверке"}
        </Button>
      </div>
      {!agreed ? <p className="disabled-hint">Чтобы продолжить, поставьте отметку о согласии.</p> : null}
      {error ? <p className="field__error">{error}</p> : null}
    </section>
  );
}
