"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { loadLanding } from "@/lib/auth";

const QUESTIONS_EDIT_ACTION = "action.vacancies.review";

export function ExpertWorkspace() {
  const [availableActions, setAvailableActions] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadLanding()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setAvailableActions(result?.landing.available_actions ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableActions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const canEditQuestions = availableActions?.includes(QUESTIONS_EDIT_ACTION) ?? false;

  if (availableActions === null) {
    return <p className="field-hint">Loading expert capabilities...</p>;
  }

  if (!canEditQuestions) {
    return (
      <div className="placeholder-card recruiter-helper-card">
        <span className="status">Expert area</span>
        <strong>Question editing is not available for your current roles.</strong>
      </div>
    );
  }

  return (
    <div className="placeholder-card recruiter-helper-card">
      <span className="status">Expert</span>
      <strong>Review submitted vacancies from one shared workspace.</strong>
      <p className="field-hint">Use the review queue to edit question packs, approve assessments, or request recruiter changes.</p>
      {error ? <p className="field-error">{error}</p> : null}
      <div className="page-actions">
        <Link className="button button--primary" href="/internal/expert/vacancies">
          Open review queue
        </Link>
      </div>
    </div>
  );
}
