"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { CandidateGate } from "@/components/chrome/CandidateGate";
import { Button } from "@/components/ui/button";
import { markForwardProgress, routeParam } from "@/lib/candidate-flow";

export default function PracticePage() {
  const token = routeParam(useParams<{ token: string }>().token);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <CandidateGate token={token} current="Практика" redirectCompleted requireConsented>
      {(_info, accessToken) => (
        <section className="setup-stage" style={{ width: "100%" }}>
          <p className="path">Практика</p>
          <h1>Короткая разминка</h1>
          <p>
            Это не часть интервью и ничего не записывается. Прочитайте вопрос вслух и ответьте себе
            за полминуты — чтобы привыкнуть говорить.
          </p>
          <p>
            <strong>Вопрос для себя:</strong> «Расскажите коротко, чем занимались на последнем месте
            работы.»
          </p>
          <div className="setup-stage__footer">
            <Button
              type="button"
              size="large"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await markForwardProgress(accessToken, "ready");
                  router.push(`/i/${accessToken}/live`);
                } catch {
                  setError("Не получилось сохранить шаг. Проверьте соединение и попробуйте ещё раз.");
                  setBusy(false);
                }
              }}
            >
              {busy ? "Открываем…" : "К интервью"}
            </Button>
          </div>
          {error ? <p className="field__error">{error}</p> : null}
        </section>
      )}
    </CandidateGate>
  );
}
