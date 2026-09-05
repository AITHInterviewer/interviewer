"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import type { Vacancy } from "@/lib/api";
import { loadVacancies } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";
const QUESTIONS_EDIT_ACTION = "action.questions.edit";

function statusTone(status: Vacancy["status"]): "positive" | "warning" | undefined {
  if (status === "ready") return "positive";
  if (status === "pending_review") return "warning";
  return undefined;
}

export default function VacanciesPage() {
  const { landing, loading } = useProtectedLanding();

  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [vacanciesLoading, setVacanciesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManage = landing?.available_areas.some((area) => area.id === RECRUITER_AREA) ?? false;
  const canReview = landing?.available_actions.includes(QUESTIONS_EDIT_ACTION) ?? false;
  const canAccess = canManage || canReview;

  useEffect(() => {
    if (!canAccess) {
      return;
    }

    let cancelled = false;
    setVacanciesLoading(true);

    loadVacancies()
      .then((response) => {
        if (!cancelled) {
          setVacancies(response.items);
        }
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(normalizeError(caughtError, "Could not load vacancies."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVacanciesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [canAccess]);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Loading" text="Checking your session..." />
      </main>
    );
  }

  const nav = buildNav(landing);

  if (!canAccess) {
    return (
      <AppShell nav={nav} title="Vacancies">
        <div className="workspace">
          <ScreenState
            kind="error"
            title="Access denied"
            text="Your roles do not grant access to vacancy management or review."
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell nav={nav} title="Vacancies">
      <div className="workspace">
        <PageHeader
          path="Vacancies"
          title="Vacancies"
          actions={
            canManage ? (
              <Button asChild>
                <Link href="/vacancies/new">Create vacancy</Link>
              </Button>
            ) : null
          }
        />

        {vacanciesLoading ? <ScreenState kind="loading" title="Loading" text="Loading vacancies..." /> : null}
        {error ? <ScreenState kind="error" title="Could not load vacancies" text={error} /> : null}

        {!vacanciesLoading && !error ? (
          vacancies.length > 0 ? (
            <table className="vacancies-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Grade</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {vacancies.map((vacancy) => (
                  <tr key={vacancy.id}>
                    <td>
                      <Link href={`/vacancies/${vacancy.id}`}>{vacancy.title}</Link>
                    </td>
                    <td>{vacancy.grade}</td>
                    <td>
                      <span className="status" data-tone={statusTone(vacancy.status)}>
                        {vacancy.status}
                      </span>
                    </td>
                    <td>{new Date(vacancy.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <ScreenState
              kind="empty"
              title="No vacancies yet"
              text="Create a vacancy to start the review and interview pipeline."
            />
          )
        ) : null}
      </div>
    </AppShell>
  );
}
