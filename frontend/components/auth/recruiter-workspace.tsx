"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { InternalUserForm } from "@/components/auth/internal-user-form";
import { ApiError, type InternalUser } from "@/lib/api";
import { loadInternalUsers, loadRoleRegistry } from "@/lib/auth";
import { formatRoleList, type RoleRegistryEntry } from "@/lib/roles";

const tabs = [
  { id: "vacancies", label: "Vacancies", state: "placeholder" },
  { id: "candidates", label: "Candidates", state: "placeholder" },
  { id: "users", label: "Users", state: "active" },
] as const;

type RecruiterTabId = (typeof tabs)[number]["id"];

export function RecruiterWorkspace() {
  const [activeTab, setActiveTab] = useState<RecruiterTabId>("users");
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [roleRegistry, setRoleRegistry] = useState<RoleRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  async function refreshUsers(options?: { preserveLoading?: boolean }) {
    try {
      if (!options?.preserveLoading) {
        setLoading(true);
      }
      setError(null);
      const response = await loadInternalUsers();
      setUsers(response.items);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else if (caughtError instanceof Error) {
        setError(caughtError.message);
      } else {
        setError("Could not load internal users.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    Promise.all([loadInternalUsers(), loadRoleRegistry()])
      .then(([usersResponse, registryEntries]) => {
        if (cancelled) {
          return;
        }

        setUsers(usersResponse.items);
        setRoleRegistry(registryEntries);
      })
      .catch((caughtError: unknown) => {
        if (cancelled) {
          return;
        }

        if (caughtError instanceof ApiError) {
          setError(caughtError.message);
        } else if (caughtError instanceof Error) {
          setError(caughtError.message);
        } else {
          setError("Could not load internal users.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="recruiter-shell">
      <div className="recruiter-tabs" role="tablist" aria-label="Recruiter workspace tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className="recruiter-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            data-active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.state === "placeholder" ? <small>coming later</small> : null}
          </button>
        ))}
      </div>

      {activeTab === "users" ? (
        <div className="recruiter-panel-grid">
          <section className="recruiter-users-panel">
            <div className="section-heading">
              <div>
                <h2>Internal users</h2>
              </div>
              <div className="page-actions">
                <button className="button button--primary" type="button" onClick={() => setIsComposerOpen((value) => !value)}>
                  {isComposerOpen ? "Hide form" : "Add new user"}
                </button>
                <button className="button button--secondary" type="button" onClick={() => void refreshUsers({ preserveLoading: false })}>
                  Refresh list
                </button>
              </div>
            </div>

            {error ? <p className="field-error recruiter-panel-message">{error}</p> : null}
            {loading ? <p className="recruiter-panel-message">Loading internal users...</p> : null}

            {!loading ? (
              <div className="recruiter-user-list">
                {users.length > 0 ? (
                  users.map((user) => (
                    <article className="candidate-card recruiter-user-card" key={user.id}>
                      <div className="candidate-card__top">
                        <div className="recruiter-user-card__identity">
                          <strong>{user.name}</strong>
                          <span className="field-hint inline-code">{user.email}</span>
                        </div>
                        <span className="status">{formatRoleList(roleRegistry, user.roles)}</span>
                      </div>
                      <div className="candidate-card__meta recruiter-user-card__meta">
                        <span>Recruiter-created</span>
                        <span>{user.created_by_user_id ? "Managed account" : "Unlinked account"}</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="placeholder-card recruiter-helper-card">
                    <span className="status">Users</span>
                    <strong>No managed users yet.</strong>
                    <p>Create a hiring manager or expert account to populate this tab for the current recruiter.</p>
                  </div>
                )}
              </div>
            ) : null}
          </section>

          <aside className="recruiter-side-panel">
            <div className="section-heading">
              <div>
                <h2>User creation</h2>
              </div>
            </div>
            <div className="recruiter-side-panel__body">
              <p className="field-hint">Use a temporary password for MVP. Invite-based setup can replace this flow later.</p>
              <InternalUserForm
                hidden={!isComposerOpen}
                onCreated={() => {
                  setIsComposerOpen(false);
                  void refreshUsers({ preserveLoading: false });
                }}
              />
              {!isComposerOpen ? (
                <div className="placeholder-card recruiter-helper-card">
                  <span className="status" data-tone="warning">Start here</span>
                  <strong>Use “Add new user” to open the creation form.</strong>
                  <p>Keep the user list visible while you onboard hiring managers and experts.</p>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : (
        <section className="placeholder-card recruiter-placeholder-panel">
          {activeTab === "vacancies" ? (
            <>
              <span className="status" data-tone="positive">Live flow</span>
              <strong>Vacancy authoring and review flow is available.</strong>
              <p>Open the recruiter vacancy list to create, edit, submit, archive, or restore recruiter-accessible vacancies.</p>
              <div className="page-actions">
                <Link className="button button--primary" href="/internal/recruiter/vacancies">
                  Open vacancies
                </Link>
              </div>
            </>
          ) : (
            <>
              <span className="status" data-tone="warning">Placeholder</span>
              <strong>Candidates tab is reserved for interview result workflows.</strong>
              <p>
                This tab is part of the final workspace structure, but the candidate flow will be implemented in a later feature slice.
              </p>
            </>
          )}
        </section>
      )}
    </section>
  );
}
