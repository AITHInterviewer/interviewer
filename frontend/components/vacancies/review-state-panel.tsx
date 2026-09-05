"use client";

import type { VacancyDetail } from "@/lib/api";
import { formatVacancyTime, hasViewerPermission, vacancyStatusLabel, vacancyStatusTone } from "@/lib/vacancies";

type ReviewStatePanelProps = {
  vacancy: VacancyDetail;
  reviewComment: string;
  onReviewCommentChange: (value: string) => void;
  onSubmit: (() => Promise<void>) | null;
  onApprove: (() => Promise<void>) | null;
  onRequestChanges: (() => Promise<void>) | null;
  onArchive: (() => Promise<void>) | null;
  onRestore: (() => Promise<void>) | null;
};

export function ReviewStatePanel({
  vacancy,
  reviewComment,
  onReviewCommentChange,
  onSubmit,
  onApprove,
  onRequestChanges,
  onArchive,
  onRestore,
}: ReviewStatePanelProps) {
  return (
    <aside className="recruiter-side-panel vacancy-review-panel">
      <div className="section-heading">
        <div>
          <h2>Review state</h2>
          <p>Current status, latest decision, and allowed actions.</p>
        </div>
      </div>
      <div className="recruiter-side-panel__body vacancy-review-panel__body">
        <span className="status" data-tone={vacancyStatusTone(vacancy.status)}>
          {vacancyStatusLabel(vacancy.status)}
        </span>
        <div className="vacancy-review-meta">
          <strong>Latest decision</strong>
          <p>{vacancy.review_state.latest_review_decision?.replaceAll("_", " ") ?? "No review yet"}</p>
        </div>
        <div className="vacancy-review-meta">
          <strong>Latest comment</strong>
          <p>{vacancy.review_state.latest_review_comment ?? "No comment"}</p>
        </div>
        <div className="vacancy-review-meta">
          <strong>Submitted at</strong>
          <p>{formatVacancyTime(vacancy.review_state.submitted_at)}</p>
        </div>

        {hasViewerPermission(vacancy, "vacancy.request_changes") ? (
          <label>
            Review comment
            <textarea
              value={reviewComment}
              onChange={(event) => onReviewCommentChange(event.target.value)}
              placeholder="Comment optional for MVP"
            />
          </label>
        ) : null}

        <div className="form-actions vacancy-review-actions">
          {onSubmit ? (
            <button className="button button--primary" type="button" onClick={() => void onSubmit()}>
              Submit for review
            </button>
          ) : null}
          {onApprove ? (
            <button className="button button--primary" type="button" onClick={() => void onApprove()}>
              Approve
            </button>
          ) : null}
          {onRequestChanges ? (
            <button className="button button--secondary" type="button" onClick={() => void onRequestChanges()}>
              Request changes
            </button>
          ) : null}
          {onArchive ? (
            <button className="button button--ghost" type="button" onClick={() => void onArchive()}>
              Archive
            </button>
          ) : null}
          {onRestore ? (
            <button className="button button--primary" type="button" onClick={() => void onRestore()}>
              Restore
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
