"use client";

import type { VacancySummary } from "@/lib/api";
import { formatVacancyTime, summarizeLatestReview, vacancyStatusLabel, vacancyStatusTone } from "@/lib/vacancies";

type VacancyListProps = {
  items: VacancySummary[];
  emptyTitle: string;
  emptyDescription: string;
  onOpen: (vacancyId: string) => void;
};

export function VacancyList({ items, emptyTitle, emptyDescription, onOpen }: VacancyListProps) {
  if (items.length === 0) {
    return (
      <div className="placeholder-card recruiter-helper-card">
        <span className="status">Vacancies</span>
        <strong>{emptyTitle}</strong>
        <p>{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className="recruiter-user-list vacancy-list">
      {items.map((item) => (
        <button
          key={item.id}
          className="candidate-card candidate-card--interactive vacancy-list__item"
          type="button"
          onClick={() => onOpen(item.id)}
        >
          <div className="candidate-card__top">
            <div className="recruiter-user-card__identity">
              <strong>{item.title || "Untitled vacancy"}</strong>
              <span className="field-hint inline-code">{item.grade ?? "grade not set"}</span>
            </div>
            <span className="status" data-tone={vacancyStatusTone(item.status)}>
              {vacancyStatusLabel(item.status)}
            </span>
          </div>
          <div className="candidate-card__meta recruiter-user-card__meta">
            <span>{item.question_count} questions</span>
            <span>{summarizeLatestReview(item.latest_review_decision)}</span>
          </div>
          <p className="field-hint">Updated {formatVacancyTime(item.updated_at)}</p>
        </button>
      ))}
    </div>
  );
}
