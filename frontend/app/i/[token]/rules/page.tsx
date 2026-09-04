"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { LaptopGate } from "@/components/chrome/LaptopGate";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { vacancy } from "@/lib/demo/vacancies";

export default function RulesPage() {
  const params = useParams<{ token: string }>();
  const candidate = getCandidateByToken(params.token);
  if (!candidate) {
    return (
      <main className="workspace">
        <ScreenState
          kind="error"
          title="Ссылка не найдена"
          text="Такого приглашения в демо нет. Вернитесь ко входу и выберите роль кандидата."
          action={
            <Button asChild variant="secondary">
              <Link href="/login">К выбору роли</Link>
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <LaptopGate>
      <CandidateShell step="Правила">
        <section className="setup-stage" style={{ width: "100%" }}>
          <h1>Правила</h1>
          <ul className="check-list" style={{ marginTop: 0 }}>
            <li>
              <span>1.</span>
              5 вопросов. К некоторым система задаст одно уточнение.
            </li>
            <li>
              <span>2.</span>
              Перед каждым вопросом - до 2 минут на подготовку. Можно начать раньше. Это время не
              оценивается.
            </li>
            <li>
              <span>3.</span>
              Ответ - до 4 минут голосом или текст без лимита символов. Одну перезапись на ответ можно
              сделать.
            </li>
            <li>
              <span>4.</span>
              Вопрос можно прослушать или попросить переформулировать. Правильный ответ система не
              подскажет.
            </li>
            <li>
              <span>5.</span>
              Можно смотреть документацию и свои заметки.
            </li>
            <li>
              <span>6.</span>
              Если оборвётся связь - вернитесь по той же ссылке, продолжите с текущего вопроса.
            </li>
            <li>
              <span>7.</span>
              Система фиксирует технические события (переключение вкладки, потеря камеры). Они не
              влияют на оценку. Рекрутер видит их отдельно.
            </li>
            <li>
              <span>8.</span>
              После отправки: обработка около часа, рекрутер свяжется до 12 сентября.
            </li>
          </ul>
          <div className="setup-stage__footer">
            <Button asChild variant="text">
              <Link href={`/i/${candidate.token}/check`}>
                <ArrowLeft size={16} />
                Назад
              </Link>
            </Button>
            <div className="candidate-actions">
              {vacancy.seniorModeDefault || candidate.seniorMode ? (
                <Button asChild variant="text">
                  <Link href={`/i/${candidate.token}/q/1`}>Пропустить тренировку</Link>
                </Button>
              ) : null}
              <Button asChild>
                <Link href={`/i/${candidate.token}/practice`}>
                  Понятно, к тренировке
                  <ArrowRight size={17} />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </CandidateShell>
    </LaptopGate>
  );
}
