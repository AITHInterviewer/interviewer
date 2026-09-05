"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import type { AnonymizedStats, VacancyDetail } from "@/lib/api";
import { loadAnonymizedStats, loadVacancy } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";

const HIRING_MANAGER_AREA = "area.hiring_manager_review";

export default function VacancyBriefPage() {
  const params = useParams<{ id: string }>();
  const { landing, loading } = useProtectedLanding();
  const isManager = landing?.available_areas.some((area) => area.id === HIRING_MANAGER_AREA) ?? false;
  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [stats, setStats] = useState<AnonymizedStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (!landing) {
      return;
    }
    let cancelled = false;

    async function loadBrief() {
      setError(null);
      try {
        const [detail, anonymized] = await Promise.all([
          loadVacancy(params.id).catch((caughtError: unknown) => {
            if (!isManager) {
              throw caughtError;
            }
            return null;
          }),
          isManager ? loadAnonymizedStats(params.id) : Promise.resolve(null),
        ]);
        if (cancelled) {
          return;
        }
        setVacancy(detail);
        setStats(anonymized);
        if (!detail && !anonymized) {
          setError("Не удалось открыть бриф.");
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(normalizeError(caughtError, "Не удалось открыть бриф."));
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    }

    void loadBrief();
    return () => {
      cancelled = true;
    };
  }, [landing, params.id, isManager]);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  return (
    <AppShell nav={buildNav(landing)} title="Бриф">
      <div className="workspace">
        {pageLoading ? <ScreenState kind="loading" title="Загрузка" text="Открываем бриф…" /> : null}
        {error ? <ScreenState kind="error" title="Нет брифа" text={error} /> : null}
        {!pageLoading && !error && (vacancy || stats) ? (
          <>
            <PageHeader
              path="Бриф"
              title={vacancy?.title ?? "Вакансия"}
              description={vacancy ? `Грейд: ${vacancy.grade}` : undefined}
            />
            {vacancy ? (
              <p>Обязательные навыки: {vacancy.required_skills.join(", ") || "не указаны"}.</p>
            ) : null}
            {stats ? (
              <p>
                Приглашено: {stats.invited}. Завершили: {stats.completed}. Ждут решения: {stats.awaiting_decision}.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
