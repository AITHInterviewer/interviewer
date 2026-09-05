"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { CandidateDeadline } from "@/components/chrome/CandidateDeadline";
import { CandidateGate } from "@/components/chrome/CandidateGate";
import { Button } from "@/components/ui/button";
import { routeParam } from "@/lib/candidate-flow";

export default function DonePage() {
  const token = routeParam(useParams<{ token: string }>().token);

  return (
    <CandidateGate token={token} current="Интервью">
      {(info, accessToken) => (
        <section className="setup-stage" style={{ width: "100%" }}>
          <p className="path">Готово</p>
          <h1>Ответы приняты</h1>
          <p>
            Интервью по вакансии «{info.vacancy_title}» записано. Дальше ответы смотрит рекрутер и
            связывается с вами сам.
          </p>
          <CandidateDeadline deadline={info.deadline} />
          <p>По вопросам свяжитесь с рекрутером тем способом, которым получили приглашение.</p>
          <div className="form-actions">
            <Button asChild>
              <Link href={`/i/${accessToken}/transcript`}>Расшифровка</Link>
            </Button>
          </div>
        </section>
      )}
    </CandidateGate>
  );
}
