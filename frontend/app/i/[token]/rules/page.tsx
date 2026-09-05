"use client";

import { useParams, useRouter } from "next/navigation";
import { Check } from "@phosphor-icons/react";

import { CandidateGate } from "@/components/chrome/CandidateGate";
import { Button } from "@/components/ui/button";
import { routeParam } from "@/lib/candidate-flow";

export default function RulesPage() {
  const token = routeParam(useParams<{ token: string }>().token);
  const router = useRouter();

  return (
    <CandidateGate token={token} current="Правила" redirectCompleted requireConsented>
      {(info, accessToken) => (
        <section className="setup-stage" style={{ width: "100%" }}>
          <p className="path">Правила</p>
          <h1>Как отвечать</h1>
          <p>
            Будет {info.questions_total} основных вопросов и при необходимости один уточняющий блок.
            Коротко, своими словами. Если связь оборвётся, откройте ту же ссылку ещё раз.
          </p>
          <ul className="check-list" style={{ marginTop: 0 }}>
            <li>
              <Check size={17} />
              <span>Говорите как на обычном собеседовании — не нужно заучивать текст.</span>
            </li>
            <li>
              <Check size={17} />
              <span>Можно помолчать и подумать. Пауза — это нормально.</span>
            </li>
            <li>
              <Check size={17} />
              <span>Не подставляйте готовый ответ нейросети как свой: рекрутер смотрит живую речь.</span>
            </li>
          </ul>
          <div className="rules-row">
            <div>
              <strong>Время</strong>
              <p>Ориентир был на экране приглашения. Точная длина зависит от ответов.</p>
            </div>
            <div>
              <strong>Запись</strong>
              <p>Разговор пишется, чтобы команда найма могла его пересмотреть.</p>
            </div>
            <div>
              <strong>Если что-то сломалось</strong>
              <p>Напишите на почту или в Telegram внизу страницы.</p>
            </div>
          </div>
          <div className="setup-stage__footer">
            <Button type="button" size="large" onClick={() => router.push(`/i/${accessToken}/practice`)}>
              Дальше, к практике
            </Button>
          </div>
        </section>
      )}
    </CandidateGate>
  );
}
