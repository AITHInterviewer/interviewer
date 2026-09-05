"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";

import { createVacancyLink, type InterviewLinkItem } from "@/lib/api";

export type CandidateLinkCreateDialogHandle = {
  open: () => void;
};

type CandidateLinkCreateDialogProps = {
  token: string;
  vacancyId: string;
  onCreated: (link: InterviewLinkItem) => void;
  onError: (message: string) => void;
};

type FormState = {
  candidate_first_name: string;
  candidate_last_name: string;
  candidate_social: string;
  candidate_email: string;
  expires_at: string;
};

const EMPTY_FORM: FormState = {
  candidate_first_name: "",
  candidate_last_name: "",
  candidate_social: "",
  candidate_email: "",
  expires_at: "",
};

export const CandidateLinkCreateDialog = forwardRef<
  CandidateLinkCreateDialogHandle,
  CandidateLinkCreateDialogProps
>(function CandidateLinkCreateDialog({ token, vacancyId, onCreated, onError }, ref) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => {
      setForm(EMPTY_FORM);
      setFieldErrors({});
      dialogRef.current?.showModal();
    },
  }));

  function patch(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.candidate_first_name.trim()) {
      errors.candidate_first_name = "First name is required.";
    }
    if (!form.candidate_last_name.trim()) {
      errors.candidate_last_name = "Last name is required.";
    }
    if (!form.candidate_social.trim()) {
      errors.candidate_social = "Social link or nickname is required.";
    }
    if (form.candidate_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.candidate_email.trim())) {
      errors.candidate_email = "Enter a valid email or leave it empty.";
    }
    if (!form.expires_at) {
      errors.expires_at = "Pick when the link stops working.";
    } else if (new Date(form.expires_at).getTime() <= Date.now()) {
      errors.expires_at = "Expiration must be in the future.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (submitting || !validate()) {
      return;
    }
    setSubmitting(true);
    try {
      const created = await createVacancyLink(token, vacancyId, {
        candidate_first_name: form.candidate_first_name.trim(),
        candidate_last_name: form.candidate_last_name.trim(),
        candidate_social: form.candidate_social.trim(),
        candidate_email: form.candidate_email.trim() || null,
        expires_at: new Date(form.expires_at).toISOString(),
      });
      dialogRef.current?.close();
      onCreated(created);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to create link.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="link-dialog" onClick={(event) => {
      if (event.target === dialogRef.current) {
        dialogRef.current.close();
      }
    }}>
      <div className="link-dialog__panel">
        <div className="section-heading">
          <div>
            <h2>Create interview link</h2>
            <p>The candidate opens this link without logging in.</p>
          </div>
        </div>
        <div className="recruiter-side-panel__body vacancy-form-grid">
          <label>
            First name
            <input
              value={form.candidate_first_name}
              onChange={(event) => patch("candidate_first_name", event.target.value)}
            />
            {fieldErrors.candidate_first_name ? (
              <span className="field-error">{fieldErrors.candidate_first_name}</span>
            ) : null}
          </label>
          <label>
            Last name
            <input
              value={form.candidate_last_name}
              onChange={(event) => patch("candidate_last_name", event.target.value)}
            />
            {fieldErrors.candidate_last_name ? (
              <span className="field-error">{fieldErrors.candidate_last_name}</span>
            ) : null}
          </label>
          <label className="vacancy-form-grid__full">
            Social link or nickname
            <input
              value={form.candidate_social}
              onChange={(event) => patch("candidate_social", event.target.value)}
              placeholder="t.me/ivan_p"
            />
            {fieldErrors.candidate_social ? (
              <span className="field-error">{fieldErrors.candidate_social}</span>
            ) : null}
          </label>
          <label>
            Email (optional)
            <input
              type="email"
              value={form.candidate_email}
              onChange={(event) => patch("candidate_email", event.target.value)}
              placeholder="ivan@example.com"
            />
            {fieldErrors.candidate_email ? (
              <span className="field-error">{fieldErrors.candidate_email}</span>
            ) : null}
          </label>
          <label>
            Available until
            <input
              type="datetime-local"
              value={form.expires_at}
              onChange={(event) => patch("expires_at", event.target.value)}
            />
            <span className="field-hint">Shown to the candidate in Moscow time (МСК).</span>
            {fieldErrors.expires_at ? (
              <span className="field-error">{fieldErrors.expires_at}</span>
            ) : null}
          </label>
        </div>
        <div className="link-dialog__actions">
          <button
            type="button"
            className="button button--ghost"
            onClick={() => dialogRef.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? "Creating…" : "Create link"}
          </button>
        </div>
      </div>
    </dialog>
  );
});
