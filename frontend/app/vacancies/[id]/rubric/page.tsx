"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { CalibrationSubnav } from "@/components/chrome/CalibrationSubnav";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SkeletonText } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import type { RubricVersion, VacancyDetail } from "@/lib/api";
import { loadRubricVersions, loadVacancy, updateManagedVacancy } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";
import { buildRequirementMap, uncoveredRequirements } from "@/lib/report";

/** Что зафиксировано в версии рубрики. Сырой JSON пользователю не показываем. */
function splitSkills(value: string): string[] {
  return value
    .split(",")
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
}

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
  const [requiredSkills, setRequiredSkills] = useState("");
  const [niceToHaveSkills, setNiceToHaveSkills] = useState("");
  const [skillError, setSkillError] = useState<string | null>(null);
  const [skillStatus, setSkillStatus] = useState<string | null>(null);
  const [skillSaving, setSkillSaving] = useState(false);

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
        setRequiredSkills(detail.required_skills.join(", "));
        setNiceToHaveSkills(detail.nice_to_have_skills.join(", "));
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
  const canEditSkills = landing?.available_areas.some((area) => area.id === "area.recruiter_workspace") ?? false;

  async function handleSaveSkills(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSkillSaving(true);
    setSkillError(null);
    setSkillStatus(null);
    try {
      const updated = await updateManagedVacancy(vacancyId, {
        requiredSkills: splitSkills(requiredSkills),
        niceToHaveSkills: splitSkills(niceToHaveSkills),
      });
      setVacancy((current) => (current ? { ...current, ...updated } : current));
      setSkillStatus("Список навыков сохранён.");
    } catch (caughtError) {
      setSkillError(normalizeError(caughtError, "Не удалось сохранить навыки."));
    } finally {
      setSkillSaving(false);
    }
  }

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
                canEditSkills
                  ? "Список навыков сохраняется в вакансии, как в настройках. Вопросы и утверждение версии — у эксперта."
                  : fromRecruiter
                    ? "Только просмотр: версию собирает и утверждает эксперт."
                    : "Требование закрывается вопросом комплекта. Где вопроса нет, в отчёте будет пробел."
              }
            />
            {fromRecruiter ? null : <CalibrationSubnav vacancyId={vacancyId} />}
            <section className="plain-section" style={{ marginTop: 20 }}>
              <h2>Состав требований</h2>
              {canEditSkills ? (
                <form className="form-surface" onSubmit={(event) => void handleSaveSkills(event)}>
                  <label>
                    Обязательные навыки
                    <input
                      value={requiredSkills}
                      onChange={(event) => setRequiredSkills(event.target.value)}
                      placeholder="python, sql"
                    />
                  </label>
                  <label>
                    Желательные навыки
                    <input
                      value={niceToHaveSkills}
                      onChange={(event) => setNiceToHaveSkills(event.target.value)}
                      placeholder="docker, kubernetes"
                    />
                  </label>
                  {skillError ? <p className="form-error">{skillError}</p> : null}
                  {skillStatus ? <p className="success-message">{skillStatus}</p> : null}
                  <div className="form-actions">
                    <Button type="submit" loading={skillSaving} loadingLabel="Сохраняем…">
                      Сохранить навыки
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="muted-copy">
                  Менять список может рекрутер в настройках вакансии. Сейчас обязательные:{" "}
                  {vacancy.required_skills.join(", ") || "не указаны"}.
                </p>
              )}
            </section>
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
