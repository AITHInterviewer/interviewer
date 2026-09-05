"use client";

import type { VacancyDetail, VacancyGrade } from "@/lib/api";
import { skillsToText } from "@/lib/vacancies";

export type VacancyDraft = {
  title: string;
  grade: VacancyGrade | "";
  job_description: string;
  ideal_candidate_profile: string;
  required_skills: string;
  nice_to_have_skills: string;
};

type VacancyFormSectionsProps = {
  vacancy: VacancyDetail;
  draft: VacancyDraft;
  readOnly: boolean;
  onChange: (next: VacancyDraft) => void;
};

export function createVacancyDraft(vacancy: VacancyDetail): VacancyDraft {
  return {
    title: vacancy.title,
    grade: vacancy.grade ?? "",
    job_description: vacancy.job_description ?? "",
    ideal_candidate_profile: vacancy.ideal_candidate_profile ?? "",
    required_skills: skillsToText(vacancy.required_skills),
    nice_to_have_skills: skillsToText(vacancy.nice_to_have_skills),
  };
}

export function VacancyFormSections({ vacancy, draft, readOnly, onChange }: VacancyFormSectionsProps) {
  function patch(field: keyof VacancyDraft, value: string) {
    onChange({ ...draft, [field]: value });
  }

  return (
    <div className="vacancy-sections">
      <section className="recruiter-users-panel">
        <div className="section-heading">
          <div>
            <h2>Role brief</h2>
            <p>Title, grade, and role context.</p>
          </div>
        </div>
        <div className="recruiter-side-panel__body vacancy-form-grid">
          <label>
            Title
            <input value={draft.title} readOnly={readOnly} onChange={(event) => patch("title", event.target.value)} />
          </label>
          <label>
            Grade
            <select value={draft.grade} disabled={readOnly} onChange={(event) => patch("grade", event.target.value)}>
              <option value="">Select grade</option>
              <option value="intern">intern</option>
              <option value="junior">junior</option>
              <option value="middle">middle</option>
              <option value="senior">senior</option>
              <option value="lead">lead</option>
            </select>
          </label>
          <label className="vacancy-form-grid__full">
            Job description
            <textarea
              value={draft.job_description}
              readOnly={readOnly}
              onChange={(event) => patch("job_description", event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="recruiter-users-panel">
        <div className="section-heading">
          <div>
            <h2>Candidate profile</h2>
            <p>Ideal profile and skill expectations.</p>
          </div>
        </div>
        <div className="recruiter-side-panel__body vacancy-form-grid">
          <label className="vacancy-form-grid__full">
            Ideal candidate profile
            <textarea
              value={draft.ideal_candidate_profile}
              readOnly={readOnly}
              onChange={(event) => patch("ideal_candidate_profile", event.target.value)}
            />
          </label>
          <label>
            Required skills
            <input
              value={draft.required_skills}
              readOnly={readOnly}
              onChange={(event) => patch("required_skills", event.target.value)}
              placeholder="Python, FastAPI"
            />
          </label>
          <label>
            Nice-to-have skills
            <input
              value={draft.nice_to_have_skills}
              readOnly={readOnly}
              onChange={(event) => patch("nice_to_have_skills", event.target.value)}
              placeholder="Docker, Redis"
            />
          </label>
        </div>
      </section>

      {readOnly ? (
        <p className="field-hint vacancy-readonly-note">
          Vacancy body is read-only for this view. Status: {vacancy.status.replaceAll("_", " ")}
        </p>
      ) : null}
    </div>
  );
}
