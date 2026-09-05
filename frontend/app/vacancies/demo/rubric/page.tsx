"use client";

import Link from "next/link";
import { CaretRight, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { VersionTag } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { buildNav } from "@/lib/nav";
import { requirements } from "@/lib/demo/rubric";
import { vacancy } from "@/lib/demo/vacancies";

export default function RubricPage() {
  const { landing, loading } = useProtectedLanding();
  const [selectedId, setSelectedId] = useState(requirements[0]?.id);
  const selected = requirements.find((item) => item.id === selectedId) ?? requirements[0];

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Проверяю доступ" text="Секунду, читаю вашу сессию." />
      </main>
    );
  }

  const nav = buildNav(landing, { includeDemo: true });

  if (!selected) {
    return (
      <AppShell nav={nav} title="Рубрика">
        <main className="workspace">
          <ScreenState
            kind="error"
            title="Вакансия не найдена"
            text="Рубрики для этой вакансии в демо нет. Вернитесь к доске кандидатов."
            action={
              <Button asChild variant="secondary">
                <Link href="/vacancies/demo/board">К доске</Link>
              </Button>
            }
          />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell nav={nav} title="Рубрика">
      <main className="workspace workspace--wide">
        <PageHeader
          path={`Вакансии / ${vacancy.title}`}
          title={`Калибровка рубрики ${vacancy.rubricVersion}`}
          description={
            <>
              Режим просмотра. <VersionTag demoNote /> Celery пока не покрыто вопросом.
            </>
          }
          actions={
            <>
              <Button asChild variant="secondary">
                <Link href="/vacancies/demo/board">Комплект вопросов</Link>
              </Button>
              <Button type="button" disabled title="В демо рубрика утверждена заранее">
                Утвердить
              </Button>
            </>
          }
        />
        <p className="pilot-hint">В демо рубрика утверждена заранее</p>
        <div className="calibration-grid">
          <aside className="requirement-index">
            <div className="section-heading">
              <div>
                <h2>Требования</h2>
                <p>{requirements.length} критериев</p>
              </div>
            </div>
            {requirements.map((item) => (
              <button
                className="expert-requirement"
                data-active={selected.id === item.id}
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
              >
                <span>
                  {item.mandatory ? "■" : "□"} {item.title}
                  <small>{item.mandatory ? "Обязательное" : "Желательное"}</small>
                </span>
                {item.coverage.every((v) => v === 0) ? (
                  <WarningCircle size={18} weight="fill" />
                ) : (
                  <CaretRight size={16} />
                )}
              </button>
            ))}
          </aside>
          <aside className="criterion-editor" style={{ gridColumn: "2 / -1" }}>
            <div className="criterion-editor__head">
              <div>
                <h2>{selected.title}</h2>
                <span className="status">{selected.mandatory ? "Обязательное" : "Желательное"}</span>
              </div>
              <div>
                <button className="text-button" type="button" disabled>
                  Редактировать
                </button>
                <p className="pilot-hint">В демо это макет</p>
              </div>
            </div>
            <dl className="criterion-fields">
              <div>
                <dt>Что проверяем</dt>
                <dd>{selected.whatWeCheck}</dd>
              </div>
              <div className="criterion-columns">
                <span>
                  <dt>Сильный ответ</dt>
                  <dd>{selected.strongAnswer}</dd>
                </span>
                <span>
                  <dt>Слабый ответ</dt>
                  <dd>{selected.weakAnswer}</dd>
                </span>
              </div>
              <div>
                <dt>Структура для кандидата</dt>
                <dd>{selected.structureHint || "не показывается"}</dd>
              </div>
              <div>
                <dt>Правило уточнения</dt>
                <dd>{selected.followUpRule || "нет"}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
