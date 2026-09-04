"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { createManagedInternalUser, loadRoleRegistry } from "@/lib/auth";
import type { RoleRegistryEntry } from "@/lib/roles";

type InternalUserFormProps = {
  onCreated?: (summary: string) => void;
  hidden?: boolean;
};

export function InternalUserForm({ onCreated, hidden = false }: InternalUserFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<RoleRegistryEntry[]>([]);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadRoleRegistry()
      .then((entries) => {
        if (cancelled) {
          return;
        }
        setAvailableRoles(entries);
        setSelectedRoles((current) =>
          current.length > 0 ? current : entries.length > 0 ? [entries[0].code] : [],
        );
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load assignable roles.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function toggleRole(roleCode: string) {
    setSelectedRoles((current) =>
      current.includes(roleCode)
        ? current.filter((code) => code !== roleCode)
        : [...current, roleCode],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus(null);

    try {
      const user = await createManagedInternalUser({
        name,
        email,
        roles: selectedRoles,
        temporaryPassword,
      });
      const message = `${user.name} (${user.roles.join(", ")}) created`;
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
      <fieldset>
        <legend>Roles</legend>
        {availableRoles.length > 0 ? (
          availableRoles.map((role) => (
            <label key={role.code} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                name="roles"
                value={role.code}
                checked={selectedRoles.includes(role.code)}
                onChange={() => toggleRole(role.code)}
              />
              <span>{role.title}</span>
            </label>
          ))
        ) : (
          <p className="field-hint">Loading assignable roles...</p>
        )}
        <span className="field-hint">Assign one or more roles from the role registry.</span>
      </fieldset>
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
        <button
          className="button button--primary"
          type="submit"
          disabled={submitting || selectedRoles.length === 0}
        >
          {submitting ? "Creating..." : "Create internal user"}
        </button>
      </div>
    </form>
  );
}
