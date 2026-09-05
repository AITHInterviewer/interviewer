"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { CalibrationSubnav } from "@/components/chrome/CalibrationSubnav";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { VacancyContextNav } from "@/components/chrome/VacancyContextNav";
import type { RubricVersion, VacancyDetail } from "@/lib/api";
import { loadRubricVersions, loadVacancy } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";

function snapshotText(snapshot: Record<string, unknown>): string {
  const skills = snapshot.required_skills;
  if (Array.isArray(skills) && skills.every((item) => typeof item === "string")) {
    return skills.join(", ") || "Навыки не указаны.";
  }
  try {
    return JSON.stringify(snapshot);
  } catch {
    return "Снимок версии недоступен.";
  }
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
        {fromRecruiter ? <VacancyContextNav vacancyId={vacancyId} /> : <CalibrationSubnav vacancyId={vacancyId} />}
        {vacancyLoading ? <ScreenState kind="loading" title="Загрузка" text="Загружаем требования…" /> : null}
        {error ? <ScreenState kind="error" title="Нет рубрики" text={error} /> : null}
        {vacancy ? (
          <>
            <PageHeader
              path={`Вакансии / ${vacancy.title}`}
              title="Требования"
              description={fromRecruiter ? "Только просмотр." : "Калибровка версии."}
            />
            <section className="plain-section">
              <h2>Обязательные навыки</h2>
              <p>{vacancy.required_skills.join(", ") || "Не указаны."}</p>
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
                          ? new Date(version.approved_at).toLocaleString("ru-RU")
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
