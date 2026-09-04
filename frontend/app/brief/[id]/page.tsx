"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Microphone } from "@phosphor-icons/react";
import { useState } from "react";

import { BrandMark } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { ToastStack } from "@/components/evidence/Drawer";
import { Button } from "@/components/ui/button";
import { clearDemoRole } from "@/lib/demo/session";

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
  const [toasts, setToasts] = useState<string[]>([]);

  return (
    <main className="manager-brief">
      <header>
        <BrandMark />
        <Link className="candidate-help__role" href="/login" onClick={() => clearDemoRole()}>
          К выбору роли
        </Link>
        <span>
          Бриф вакансии, вопрос {index + 1} из 5 · <PilotBadge />
        </span>
      </header>
      <section>
        <PageHeader
          path={`Бриф / вопрос ${index + 1} из 5`}
          title={QUESTIONS[index] ?? "Вопрос брифа"}
          description="Отвечайте как удобно. Система соберёт черновик требований."
        />
        <div className="brief-progress">
          <i style={{ width: `${((index + 1) / 5) * 100}%` }} />
        </div>
        <textarea placeholder="Например: разберётся с очередью ночных задач..." />
        <div className="brief-actions">
          <Button type="button" variant="text" onClick={() => setToasts((current) => [...current, "В пилоте это макет"])}>
            <Microphone size={18} />
            Ответить голосом
          </Button>
          <div>
            <Button type="button" variant="text" disabled={index === 0} onClick={() => setIndex((v) => v - 1)}>
              Назад
            </Button>
            {index === 0 ? <p className="disabled-hint">Это первый шаг</p> : null}
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
      <ToastStack messages={toasts} />
    </main>
  );
}
