"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle } from "@phosphor-icons/react";
import { useEffect } from "react";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { updateSession } from "@/lib/demo/session";
import { vacancy } from "@/lib/demo/vacancies";

export default function DonePage() {
  const params = useParams<{ token: string }>();
  const candidate = getCandidateByToken(params.token);

  useEffect(() => {
    if (!candidate) return;
    updateSession(candidate.token, { submitted: true, interrupted: false });
  }, [candidate]);

  if (!candidate) return null;

  return (
    <CandidateShell step="Готово">
      <section className="completion-stage">
        <CheckCircle size={50} weight="fill" />
        <h1>Интервью отправлено</h1>
        <p>Ответы обрабатываются. Обычно это занимает около часа.</p>
        <div className="next-steps">
          <div>
            <span>Сегодня</span>
            <strong>Система подготовит отчёт</strong>
          </div>
          <div>
            <span>До 12 сентября</span>
            <strong>{vacancy.recruiterName} посмотрит отчёт и свяжется с вами</strong>
          </div>
          <div>
            <span>Позже</span>
            <strong>Вы получите краткую сводку - что подтвердилось, что нет</strong>
          </div>
        </div>
        <Button asChild variant="secondary">
          <Link href={`/i/${candidate.token}/transcript`}>Транскрипт и правки терминов</Link>
        </Button>
        <Button asChild variant="text">
          <Link href={`/i/${candidate.token}/request`}>Запросить удаление данных</Link>
        </Button>
      </section>
    </CandidateShell>
  );
}
