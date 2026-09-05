"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { VacancyList } from "@/components/vacancies/vacancy-list";
import { createRecruiterVacancy, listRecruiterVacancies, type VacancySummary } from "@/lib/api";
import { getSession, loadLanding } from "@/lib/auth";

export default function RecruiterVacanciesPage() {
  const router = useRouter();
  const [items, setItems] = useState<VacancySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const result = await loadLanding();
    if (!result) {
      throw new Error("Authentication required.");
    }
    const session = getSession();
    if (!session) {
      throw new Error("Authentication required.");
    }
    const response = await listRecruiterVacancies(session.token);
    setItems(response.items);
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const result = await loadLanding();
        if (!result || cancelled) {
          return;
        }
        const session = getSession();
        if (!session) {
          throw new Error("Authentication required.");
        }
        const response = await listRecruiterVacancies(session.token);
        if (!cancelled) {
          setItems(response.items);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Could not load vacancies.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ProtectedRolePage requiredArea="area.recruiter_workspace">
      <div className="recruiter-shell">
        <div className="section-heading recruiter-vacancy-list__head">
          <div>
            <h2>Recruiter vacancies</h2>
            <p>Active and inherited-access vacancies you can control.</p>
          </div>
          <div className="page-actions">
            <button
              className="button button--primary"
              type="button"
              onClick={async () => {
                try {
                  const session = getSession();
                  if (!session) {
                    throw new Error("Authentication required.");
                  }
                  const vacancy = await createRecruiterVacancy(session.token, {});
                  router.push(`/internal/vacancies/${vacancy.id}`);
                } catch (caughtError) {
                  setError(caughtError instanceof Error ? caughtError.message : "Could not create vacancy.");
                }
              }}
            >
              Create vacancy
            </button>
            <button className="button button--secondary" type="button" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        </div>
        {error ? <p className="field-error recruiter-panel-message">{error}</p> : null}
        {loading ? <div className="loading-panel"><strong>Loading recruiter vacancies...</strong></div> : null}
        {!loading ? (
          <VacancyList
            items={items}
            emptyTitle="No recruiter vacancies yet."
            emptyDescription="Create your first vacancy draft to start the review workflow."
            onOpen={(vacancyId) => router.push(`/internal/vacancies/${vacancyId}`)}
          />
        ) : null}
      </div>
    </ProtectedRolePage>
  );
}
