"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { VacancyList } from "@/components/vacancies/vacancy-list";
import { listExpertVacancies, type VacancySummary } from "@/lib/api";
import { getSession } from "@/lib/auth";

export default function ExpertVacanciesPage() {
  const router = useRouter();
  const [items, setItems] = useState<VacancySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const session = getSession();
    if (!session) {
      throw new Error("Authentication required.");
    }
    const response = await listExpertVacancies(session.token);
    setItems(response.items);
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const session = getSession();
        if (!session) {
          throw new Error("Authentication required.");
        }
        const response = await listExpertVacancies(session.token);
        if (!cancelled) {
          setItems(response.items);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Could not load queue.");
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
    <ProtectedRolePage requiredArea="area.expert_questions">
      <div className="recruiter-shell">
        <div className="section-heading recruiter-vacancy-list__head">
          <div>
            <h2>Expert review queue</h2>
            <p>Vacancies waiting for assessment review.</p>
          </div>
          <div className="page-actions">
            <button className="button button--secondary" type="button" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        </div>
        {error ? <p className="field-error recruiter-panel-message">{error}</p> : null}
        {loading ? <div className="loading-panel"><strong>Loading review queue...</strong></div> : null}
        {!loading ? (
          <VacancyList
            items={items}
            emptyTitle="No vacancies waiting for review."
            emptyDescription="The expert queue is empty right now."
            onOpen={(vacancyId) => router.push(`/internal/vacancies/${vacancyId}`)}
          />
        ) : null}
      </div>
    </ProtectedRolePage>
  );
}
