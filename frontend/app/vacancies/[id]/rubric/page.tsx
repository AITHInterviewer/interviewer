"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { CalibrationSubnav } from "@/components/chrome/CalibrationSubnav";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SkeletonText } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import type { RubricVersion, VacancyDetail } from "@/lib/api";
import { loadRubricVersions, loadVacancy } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";
import { buildRequirementMap, uncoveredRequirements } from "@/lib/report";

/** Что зафиксировано в версии рубрики. Сырой JSON пользователю не показываем. */
function snapshotText(snapshot?: Record<string, unknown>): string {
  const skills = snapshot?.required_skills;
  if (Array.isArray(skills) && skills.every((item) => typeof item === "string")) {
    return skills.join(", ") || "Навыки в этой версии не перечислены.";
  }
  return "В этой версии список навыков не сохранился.";
}

function RubricInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const vacancyId = params.id;
  const fromRecruiter = searchParams.get("from") === "recruiter";
  const { landing, loading } = useProtectedLanding();
  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [versions, setVersions] = useState<RubricVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vacancyLoading, setVacancyLoading] = useState(true);

  useEffect(() => {
    if (!landing) {
      return;
    }
    let cancelled = false;
    Promise.all([loadVacancy(vacancyId), loadRubricVersions(vacancyId)])
      .then(([detail, versionResponse]) => {
        if (cancelled) {
          return;
        }
        setVacancy(detail);
        setVersions(versionResponse.items);
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(normalizeError(caughtError, "Не удалось загрузить рубрику."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVacancyLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [landing, vacancyId]);

  const coverage = vacancy ? buildRequirementMap(vacancy, vacancy.questions, []) : [];
  const gaps = uncoveredRequirements(coverage);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  return (
    <AppShell nav={buildNav(landing)} title="Рубрика">
      <div className="workspace">
        {vacancyLoading ? <SkeletonText lines={4} label="Загружаю требования" /> : null}
        {error ? <ScreenState kind="error" title="Нет рубрики" text={error} /> : null}
        {vacancy ? (
          <>
            <PageHeader
              path={`Вакансии / ${vacancy.title}`}
              title="Требования"
              description={
                fromRecruiter
                  ? "Только просмотр: версию собирает и утверждает эксперт."
                  : "Требование закрывается вопросом комплекта. Где вопроса нет, в отчёте будет пробел."
              }
            />
            {fromRecruiter ? null : <CalibrationSubnav vacancyId={vacancyId} />}
            {gaps.length > 0 ? (
              <p className="report-gap">
                Ни один вопрос комплекта не закрывает: {gaps.map((row) => row.skill).join(", ")}. Пока
                это так, в отчёте по такому требованию будет стоять «вопрос не задавался».
              </p>
            ) : null}

            <section className="requirement-map__list" style={{ marginTop: 20 }}>
              <header>
                <h2>Требования и покрытие</h2>
                <span className="muted-copy">
                  {coverage.filter((row) => row.coverage !== "not-covered").length} из {coverage.length}{" "}
                  закрыты вопросами
                </span>
              </header>
              {coverage.length === 0 ? (
                <p className="muted-copy" style={{ padding: "16px 20px" }}>
                  Требования вакансии не заполнены. Добавьте их в настройках, тогда появится покрытие.
                </p>
              ) : (
                coverage.map((row) => (
                  <div className="requirement-row" key={row.skill}>
                    <span>
                      <strong>{row.skill}</strong>
                      <span className="muted-copy">
                        {row.mandatory ? "Обязательное" : "Желательное"}
                        {row.questions.length > 0
                          ? ` · закрывает вопрос ${row.questions.map((question) => question.order).join(", ")}`
                          : " · вопроса нет"}
                      </span>
                    </span>
                    <StatusPill tone={row.coverage === "not-covered" ? "unchecked" : "confirmed"}>
                      {row.coverage === "not-covered" ? "Нет вопроса" : "Вопрос есть"}
                    </StatusPill>
                  </div>
                ))
              )}
            </section>
            <section className="plain-section">
              <h2>Ранее одобренные версии</h2>
              {versions.length > 0 ? (
                <ul className="stack-list">
                  {versions.map((version) => (
                    <li key={version.id}>
                      <strong>Версия {version.version_number}</strong>
                      <p>
                        {version.approved_at
                          ? new Date(version.approved_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
                          : "Дата одобрения не указана"}
                      </p>
                      <p>{snapshotText(version.snapshot)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Одобренных версий пока нет.</p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function VacancyRubricPage() {
  return (
    <Suspense fallback={<ScreenState kind="loading" title="Загрузка" text="Открываем рубрику…" />}>
      <RubricInner />
    </Suspense>
  );
}
