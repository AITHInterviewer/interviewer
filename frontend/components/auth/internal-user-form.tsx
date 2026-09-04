"use client";

import { useState } from "react";

import { ApiError, type InternalRole } from "@/lib/api";
import { createManagedInternalUser } from "@/lib/auth";

type InternalUserFormProps = {
  onCreated?: (summary: string) => void;
  hidden?: boolean;
};

export function InternalUserForm({ onCreated, hidden = false }: InternalUserFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<InternalRole, "recruiter">>("hiring_manager");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus(null);

    try {
      const user = await createManagedInternalUser({
        name,
        email,
        role,
        temporaryPassword,
      });
      const message = `${user.name} (${user.role}) created`;
      setStatus(message);
      setName("");
      setEmail("");
      setTemporaryPassword("");
      onCreated?.(message);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else {
        setError("Could not create the internal user.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} hidden={hidden}>
      <div className="form-intro">
        <span className="status">Recruiter-only</span>
        <p className="field-hint">Create a managed account and keep temporary credentials visible only long enough to hand them off securely.</p>
      </div>

      <label>
        Full name
        <input value={name} onChange={(event) => setName(event.target.value)} name="name" required />
      </label>
      <label>
        Work email
        <input value={email} onChange={(event) => setEmail(event.target.value)} name="email" type="email" required />
      </label>
      <label>
        Role
        <select
          value={role}
          onChange={(event) => setRole(event.target.value as Exclude<InternalRole, "recruiter">)}
          name="role"
        >
          <option value="hiring_manager">Hiring manager</option>
          <option value="expert">Expert</option>
        </select>
      </label>
      <label>
        Temporary password
        <input
          value={temporaryPassword}
          onChange={(event) => setTemporaryPassword(event.target.value)}
          name="temporaryPassword"
          type="password"
          minLength={8}
          required
        />
        <span className="field-hint">Share this password manually with the new internal user.</span>
      </label>

      <div className="auth-inline-note">
        <div>
          <span className="path">Ownership</span>
          <strong>Scoped to current recruiter</strong>
        </div>
        <p className="field-hint">New accounts will appear only inside the signed-in recruiter workspace.</p>
      </div>

      {error ? <p className="field-error">{error}</p> : null}
      {status ? <p className="success-message">{status}</p> : null}

      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={submitting}>
          {submitting ? "Creating..." : "Create internal user"}
        </button>
      </div>
    </form>
  );
}
