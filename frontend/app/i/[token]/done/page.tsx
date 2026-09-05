"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

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
            Спасибо. Интервью по вакансии «{info.vacancy_title}» записано. Дальше его смотрит
            рекрутер. Оценку, карту требований и решение команды на этой странице нет — это
            внутренняя работа найма.
          </p>
          <p>Если понадобится расшифровка или нужно что-то уточнить у рекрутера — ссылки ниже.</p>
          <div className="form-actions">
            <Button asChild>
              <Link href={`/i/${accessToken}/transcript`}>Расшифровка</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/i/${accessToken}/request`}>Написать рекрутеру</Link>
            </Button>
          </div>
        </section>
      )}
    </CandidateGate>
  );
}
