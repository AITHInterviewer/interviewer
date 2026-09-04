"use client";

import { useEffect, useState } from "react";

import { ApiError, createQuestion } from "@/lib/api";
import { getSession, loadLanding } from "@/lib/auth";

const QUESTIONS_EDIT_ACTION = "action.questions.edit";

export function ExpertWorkspace() {
  const [availableActions, setAvailableActions] = useState<string[] | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const session = getSession();
    if (!session) {
      setError("Authentication required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatus(null);

    try {
      const question = await createQuestion(session.token, { text });
      setStatus(`Question ${question.id.slice(0, 8)} created.`);
      setText("");
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError("Could not create the question.");
      }
    } finally {
      setSubmitting(false);
    }
  }

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
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-intro">
        <span className="status">Expert</span>
        <p className="field-hint">Create an interview question. Full question management arrives in a later slice.</p>
      </div>
      <label>
        Question text
        <textarea value={text} onChange={(event) => setText(event.target.value)} name="text" required />
      </label>
      {error ? <p className="field-error">{error}</p> : null}
      {status ? <p className="success-message">{status}</p> : null}
      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create question"}
        </button>
      </div>
    </form>
  );
}
