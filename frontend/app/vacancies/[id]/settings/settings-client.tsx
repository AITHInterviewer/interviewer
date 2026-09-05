"use client";

import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { VacancyContextNav } from "@/components/chrome/VacancyContextNav";
import { Button } from "@/components/ui/button";
import type { VacancyDetail } from "@/lib/api";
import {
  archiveManagedVacancy,
  loadVacancy,
  pauseManagedVacancy,
  resumeManagedVacancy,
  updateManagedVacancy,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, VACANCY_STATUS_LABEL } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";

function splitSkills(value: string): string[] {
  return value
    .split(",")
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
}

export function VacancySettingsClient({ vacancyId }: { vacancyId: string }) {
  const { landing, loading } = useProtectedLanding({ requiredArea: RECRUITER_AREA });

  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [vacancyLoading, setVacancyLoading] = useState(true);
  const [vacancyError, setVacancyError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [grade, setGrade] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [niceToHaveSkills, setNiceToHaveSkills] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  useEffect(() => {
    if (!landing) {
      return;
    }

    let cancelled = false;

    loadVacancy(vacancyId)
      .then((detail) => {
        if (cancelled) {
          return;
        }
        setVacancy(detail);
        setTitle(detail.title);
        setDescription(detail.description);
        setGrade(detail.grade);
        setRequiredSkills(detail.required_skills.join(", "));
        setNiceToHaveSkills(detail.nice_to_have_skills.join(", "));
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setVacancyError(normalizeError(caughtError, "Could not load the vacancy."));
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
        <ScreenState kind="loading" title="Loading" text="Checking your session..." />
      </main>
    );
  }

  async function runLifecycle(
    run: () => Promise<{ status: VacancyDetail["status"] }>,
    fallback: string,
    successText: string,
  ) {
    setLifecycleBusy(true);
    setError(null);
    setStatus(null);
    try {
      const updated = await run();
      setVacancy((current) => (current ? { ...current, ...updated } : current));
      setStatus(successText);
    } catch (caughtError) {
      setError(normalizeError(caughtError, fallback));
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus(null);

    try {
      const updated = await updateManagedVacancy(vacancyId, {
        title,
        description,
        grade,
        requiredSkills: splitSkills(requiredSkills),
        niceToHaveSkills: splitSkills(niceToHaveSkills),
      });
      setVacancy((current) => (current ? { ...current, ...updated } : current));
      setStatus("Vacancy updated.");
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Could not update the vacancy."));
    } finally {
      setSubmitting(false);
    }
  }

  const nav = buildNav(landing);

  return (
    <AppShell nav={nav} title="Vacancy settings">
      <div className="workspace workspace--form">
        <PageHeader path={`Вакансии / ${vacancy?.title ?? vacancyId}`} title="Настройки" />
        <VacancyContextNav vacancyId={vacancyId} />

        {vacancyLoading ? <ScreenState kind="loading" title="Loading" text="Loading vacancy..." /> : null}
        {vacancyError ? <ScreenState kind="error" title="Could not load vacancy" text={vacancyError} /> : null}

        {!vacancyLoading && vacancy ? (
          <form className="form-surface" onSubmit={handleSubmit}>
            <p>
              Текущий статус: {VACANCY_STATUS_LABEL[vacancy.status] ?? vacancy.status}
            </p>
            {vacancy.status === "active" ||
            vacancy.status === "paused" ||
            vacancy.status === "approved" ? (
              <div className="form-actions">
                {vacancy.status === "active" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={lifecycleBusy}
                    onClick={() =>
                      void runLifecycle(
                        () => pauseManagedVacancy(vacancyId),
                        "Не удалось поставить на паузу.",
                        "Вакансия на паузе.",
                      )
                    }
                  >
                    Пауза
                  </Button>
                ) : null}
                {vacancy.status === "paused" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={lifecycleBusy}
                    onClick={() =>
                      void runLifecycle(
                        () => resumeManagedVacancy(vacancyId),
                        "Не удалось возобновить вакансию.",
                        "Вакансия снова активна.",
                      )
                    }
                  >
                    Возобновить
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={lifecycleBusy}
                  onClick={() =>
                    void runLifecycle(
                      () => archiveManagedVacancy(vacancyId),
                      "Не удалось архивировать вакансию.",
                      "Вакансия в архиве.",
                    )
                  }
                >
                  Архив
                </Button>
              </div>
            ) : null}
            <label>
              Title
              <input value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label>
              Description
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
            </label>
            <label>
              Grade
              <input value={grade} onChange={(event) => setGrade(event.target.value)} required />
            </label>
            <label>
              Required skills
              <input
                value={requiredSkills}
                onChange={(event) => setRequiredSkills(event.target.value)}
                placeholder="python, sql"
              />
            </label>
            <label>
              Nice-to-have skills
              <input
                value={niceToHaveSkills}
                onChange={(event) => setNiceToHaveSkills(event.target.value)}
                placeholder="docker, kubernetes"
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            {status ? <p className="success-message">{status}</p> : null}
            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </AppShell>
  );
}
