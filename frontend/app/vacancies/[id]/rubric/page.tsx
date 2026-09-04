"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CaretRight, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";

import { AppShell, expertNav, recruiterNav } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { VersionTag } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { requirements } from "@/lib/demo/rubric";
import { getVacancy } from "@/lib/demo/vacancies";

export default function RubricPage() {
  const params = useParams<{ id: string }>();
  const vacancy = getVacancy(params.id);
  const [selectedId, setSelectedId] = useState(requirements[0]?.id);
  const selected = requirements.find((item) => item.id === selectedId) ?? requirements[0];

  if (!vacancy || !selected) {
    return (
      <AppShell nav={expertNav()} title="Рубрика">
        <main className="workspace">
          <ScreenState
            kind="error"
            title="Вакансия не найдена"
            text="Рубрики для этой вакансии в демо нет. Вернитесь к задачам эксперта."
            action={
              <Button asChild variant="secondary">
                <Link href="/expert">К задачам</Link>
              </Button>
            }
          />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell nav={[...recruiterNav(), ...expertNav()]} title="Рубрика">
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
                <Link href={`/vacancies/${vacancy.id}/questions`}>Комплект вопросов</Link>
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
