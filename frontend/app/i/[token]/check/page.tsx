"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "@phosphor-icons/react";

import { CandidateGate } from "@/components/chrome/CandidateGate";
import { Button } from "@/components/ui/button";
import { markForwardProgress, routeParam } from "@/lib/candidate-flow";

export default function CheckPage() {
  const token = routeParam(useParams<{ token: string }>().token);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <CandidateGate token={token} current="Проверка" redirectCompleted requireConsented>
      {(_info, accessToken) => (
        <section className="setup-stage" style={{ width: "100%" }}>
          <p className="path">Проверка</p>
          <h1>Проверьте себя перед стартом</h1>
          <p>
            Камера не обязательна. С телефона можно проходить так же, как с компьютера. Доступ к
            микрофону система спросит уже в комнате интервью, если он понадобится.
          </p>
          <ul className="check-list" style={{ marginTop: 0 }}>
            <li>
              <Check size={17} />
              <span>Тихое место и стабильный интернет.</span>
            </li>
            <li>
              <Check size={17} />
              <span>Наушники или динамик, чтобы слышать вопросы.</span>
            </li>
            <li>
              <Check size={17} />
              <span>Если камеры нет — это нормально, интервью от этого не закроется.</span>
            </li>
          </ul>
          <div className="setup-stage__footer">
            <Button
              type="button"
              size="large"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await markForwardProgress(accessToken, "device_checked");
                  router.push(`/i/${accessToken}/rules`);
                } catch {
                  setError("Не получилось сохранить шаг. Проверьте соединение и попробуйте ещё раз.");
                  setBusy(false);
                }
              }}
            >
              {busy ? "Сохраняем…" : "Дальше, к правилам"}
            </Button>
          </div>
          {error ? <p className="field__error">{error}</p> : null}
        </section>
      )}
    </CandidateGate>
  );
}
