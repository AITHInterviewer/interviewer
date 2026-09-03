"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Microphone } from "@phosphor-icons/react";
import { useState } from "react";

import { BrandMark } from "@/components/chrome/AppShell";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";

const QUESTIONS = [
  "Какие три задачи этот человек будет делать в первый месяц?",
  "Без чего вы не возьмёте, даже если всё остальное хорошо?",
  "Чему готовы научить на месте?",
  "Что было плохо у прошлых кандидатов или сотрудников на этой роли?",
  "Насколько самостоятельно человек должен работать?",
];

export default function BriefPage() {
  const params = useParams<{ id: string }>();
  const [index, setIndex] = useState(0);

  return (
    <main className="manager-brief">
      <header>
        <BrandMark />
        <span>
          Бриф вакансии, вопрос {index + 1} из 5 · <PilotBadge />
        </span>
      </header>
      <section>
        <div className="brief-progress">
          <i style={{ width: `${((index + 1) / 5) * 100}%` }} />
        </div>
        <h1>{QUESTIONS[index]}</h1>
        <p>Отвечайте как удобно. Система соберёт черновик требований.</p>
        <textarea placeholder="Например: разберётся с очередью ночных задач..." />
        <div className="brief-actions">
          <button className="text-button" type="button">
            <Microphone size={18} />
            Ответить голосом
          </button>
          <div>
            <button className="text-button" type="button" disabled={index === 0} onClick={() => setIndex((v) => v - 1)}>
              Назад
            </button>
            {index === 4 ? (
              <Button asChild>
                <Link href={`/brief/${params.id}/confirm`}>
                  Собрать требования
                  <ArrowRight size={17} />
                </Link>
              </Button>
            ) : (
              <Button type="button" onClick={() => setIndex((v) => Math.min(4, v + 1))}>
                Следующий вопрос
                <ArrowRight size={17} />
              </Button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
