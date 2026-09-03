"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Check, Clock, ListChecks } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { useIsNarrow } from "@/components/chrome/LaptopGate";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { readSession, updateSession } from "@/lib/demo/session";
import { vacancy } from "@/lib/demo/vacancies";

export default function CandidateInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const narrow = useIsNarrow(900);
  const [ready, setReady] = useState(false);
  const candidate = getCandidateByToken(params.token);

  useEffect(() => {
    if (!candidate) return;
    let cancelled = false;
    const session = readSession(candidate.token);
    if (session.submitted) {
      router.replace(`/i/${candidate.token}/done`);
      return;
    }
    if (session.interrupted || (session.started && session.currentQuestion > 1 && !session.submitted)) {
      router.replace(`/i/${candidate.token}/resume`);
      return;
    }
    updateSession(candidate.token, { started: true });
    const id = window.setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [candidate, router]);

  if (!candidate) {
    return (
      <main className="workspace">
        <h1>Ссылка не найдена</h1>
        <Button asChild variant="secondary">
          <Link href="/404">Открыть 404</Link>
        </Button>
      </main>
    );
  }

  if (!ready) return null;

  return (
    <CandidateShell step="Приглашение" vacancyTitle={vacancy.title}>
      <section className="candidate-intro">
        <h1>Технический этап</h1>
        <div className="interview-facts">
          <span>
            <Clock size={18} />
            ~25 минут
          </span>
          <span>
            <ListChecks size={18} />
            5 вопросов
          </span>
          <span>пройти до {candidate.deadline}</span>
        </div>
        <div className="plain-section">
          <h2>Как это устроено</h2>
          <ul className="check-list">
            <li>
              <Check size={17} />
              Отвечаете голосом или текстом, когда удобно.
            </li>
            <li>
              <Check size={17} />
              Перед каждым вопросом есть время подумать - оно не оценивается.
            </li>
            <li>
              <Check size={17} />
              Система может задать одно уточнение к ответу.
            </li>
            <li>
              <Check size={17} />
              Оценивается содержание ответов. Речь, мимика и скорость не оцениваются.
            </li>
            <li>
              <Check size={17} />
              Решение принимает рекрутер - {vacancy.recruiterName}. Ответ до 12 сентября.
            </li>
          </ul>
        </div>
        <div className="rules-row">
          <div>
            <strong>Можно</strong>
            <p>Документация и свои заметки</p>
          </div>
          <div>
            <strong>Нельзя</strong>
            <p>Генерировать ответ за вас</p>
          </div>
          <div>
            <strong>Устройство</strong>
            <p>Нужен ноутбук с микрофоном. Камера - по желанию</p>
          </div>
        </div>
        <div className="candidate-actions">
          {narrow ? (
            <Button
              size="large"
              type="button"
              onClick={() => alert("В демо ссылка уже у вас. Откройте её с ноутбука.")}
            >
              Прислать ссылку на почту
            </Button>
          ) : (
            <Button asChild size="large">
              <Link href={`/i/${candidate.token}/consent`}>
                Начать
                <ArrowRight size={19} />
              </Link>
            </Button>
          )}
          <button className="text-button" type="button">
            Напомнить позже
          </button>
        </div>
        {narrow ? (
          <p className="human-contact">Интервью проходят с ноутбука.</p>
        ) : (
          <p className="human-contact">
            {vacancy.recruiterName} свяжется с вами до 12 сентября.
          </p>
        )}
      </section>
    </CandidateShell>
  );
}
