"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { createManagedVacancy } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";

function splitSkills(value: string): string[] {
  return value
    .split(",")
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
}

export default function NewVacancyPage() {
  const router = useRouter();
  const { landing, loading } = useProtectedLanding({ requiredArea: RECRUITER_AREA });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [grade, setGrade] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [niceToHaveSkills, setNiceToHaveSkills] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Loading" text="Checking your session..." />
      </main>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const vacancy = await createManagedVacancy({
        title,
        description,
        grade,
        requiredSkills: splitSkills(requiredSkills),
        niceToHaveSkills: splitSkills(niceToHaveSkills),
      });
      router.push(`/vacancies/${vacancy.id}`);
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Could not create the vacancy."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell nav={buildNav(landing)} title="New vacancy">
      <div className="workspace workspace--form">
        <PageHeader path="Vacancies / New" title="Create vacancy" description="Skills fields accept comma-separated values." />
        <form className="form-surface" onSubmit={handleSubmit}>
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
          <div className="form-actions">
            <button className="button button--primary" type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create vacancy"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
