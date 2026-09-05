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
        const consented = Boolean(info.consented);
        return (
          <section className="setup-stage" style={{ width: "100%" }}>
            <p className="path">Возврат</p>
            <h1>Можно продолжить с того же места</h1>
            <p>
              {consented
                ? "Согласие уже есть. Если устройство ещё не проверяли — сначала короткий чеклист. Если уже проверяли — сразу к разговору."
                : "Сначала нужно согласие на запись, затем можно вернуться к интервью."}
            </p>
            <div className="setup-stage__footer">
              <Button asChild size="large">
                <Link href={nextHref}>
                  {consented
                    ? nextHref.endsWith("/live")
                      ? "Продолжить интервью"
                      : "Перейти к проверке"
                    : "Перейти к согласию"}
                </Link>
              </Button>
              {consented && nextHref.endsWith("/live") ? (
                <Button asChild variant="secondary">
                  <Link href={`/i/${accessToken}/check`}>Сначала проверка</Link>
                </Button>
              ) : null}
            </div>
          </section>
        );
      }}
    </CandidateGate>
  );
}
