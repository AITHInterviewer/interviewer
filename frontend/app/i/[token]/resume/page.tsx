"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { CandidateGate } from "@/components/chrome/CandidateGate";
import { Button } from "@/components/ui/button";
import { resumeHref, routeParam } from "@/lib/candidate-flow";

export default function ResumePage() {
  const token = routeParam(useParams<{ token: string }>().token);

  return (
    <CandidateGate token={token} current="Интервью" redirectCompleted>
      {(info, accessToken) => {
        const nextHref = resumeHref(accessToken, info);
        return (
          <section className="setup-stage">
            <p className="path">Возврат</p>
            <h1>Можно продолжить с того же места</h1>
            <p>
              {nextHref.endsWith("/live")
                ? "Согласие и проверка устройств уже пройдены — возвращаемся сразу в разговор."
                : "Понадобится ещё раз подтвердить согласие на запись и проверить камеру с микрофоном."}
            </p>
            <div className="setup-stage__footer">
              <Button asChild size="large">
                <Link href={nextHref}>{nextHref.endsWith("/live") ? "Продолжить интервью" : "Перейти к настройке"}</Link>
              </Button>
            </div>
          </section>
        );
      }}
    </CandidateGate>
  );
}
