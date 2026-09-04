"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useState } from "react";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Drawer } from "@/components/evidence/Drawer";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { updateSession } from "@/lib/demo/session";

export default function ConsentPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const candidate = getCandidateByToken(params.token);
  const [audio, setAudio] = useState(false);
  const [video, setVideo] = useState(false);
  const [docOpen, setDocOpen] = useState(false);

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
    <CandidateShell step="Согласие">
      <section className="setup-stage" style={{ width: "100%" }}>
        <h1>Согласие на обработку</h1>
        <p>
          Аудио и транскрипт нужны для технической оценки. Видео - для фиксации технических событий, по
          желанию. Ответы и отчёт видят рекрутер и нанимающий менеджер.
        </p>
        <p>
          Видео удаляется через 30 дней после закрытия вакансии, аудио и транскрипт - через 90, отчёт -
          через год.
        </p>
        <p>
          Кто видит: рекрутер, нанимающий менеджер, технический эксперт при выборочной проверке. Модель
          оценки не получает ваше имя, фото и возраст.
        </p>
        <label className="consent-row">
          <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />
          <span>
            <strong>Согласен на запись аудио, транскрипцию и обработку ответов</strong>
            <small>Обязательно для прохождения.</small>
          </span>
        </label>
        <label className="consent-row">
          <input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} />
          <span>
            <strong>Согласен на запись видео</strong>
            <small>Без видео интервью проходит так же. Камера не влияет на оценку.</small>
          </span>
        </label>
        <button className="text-button" type="button" onClick={() => setDocOpen(true)}>
          Полный текст согласия
        </button>
        <div className="setup-stage__footer">
          <Button asChild variant="text">
            <Link href={`/i/${candidate.token}`}>
              <ArrowLeft size={16} />
              Назад
            </Link>
          </Button>
          <div>
            <Button
              type="button"
              disabled={!audio}
              onClick={() => {
                updateSession(candidate.token, { consentAudio: audio, consentVideo: video });
                router.push(`/i/${candidate.token}/check`);
              }}
            >
              Продолжить
              <ArrowRight size={17} />
            </Button>
            {!audio ? <p className="disabled-hint">Отметьте согласие на запись аудио</p> : null}
          </div>
        </div>
      </section>
      <Drawer open={docOpen} title="Полный текст согласия" onClose={() => setDocOpen(false)}>
        <div className="evidence-section">
          <p>
            Демо-документ. В пилоте здесь будет юридический текст организации о записи, хранении и
            доступе к ответам кандидата.
          </p>
        </div>
      </Drawer>
    </CandidateShell>
  );
}
