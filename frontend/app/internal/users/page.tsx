"use client";

import { useEffect, useState } from "react";

import { InternalUserForm } from "@/components/auth/internal-user-form";
import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import type { InternalUser } from "@/lib/api";
import { loadInternalUsers, loadRoleRegistry } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, USERS_MANAGE_ACTION } from "@/lib/nav";
import { formatRoleList, type RoleRegistryEntry } from "@/lib/roles";

export default function InternalUsersPage() {
  const { landing, loading } = useProtectedLanding({ requiredAction: USERS_MANAGE_ACTION });

  const [users, setUsers] = useState<InternalUser[]>([]);
  const [roleRegistry, setRoleRegistry] = useState<RoleRegistryEntry[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);

  async function refreshUsers() {
    try {
      setUsersLoading(true);
      setUsersError(null);
      const response = await loadInternalUsers();
      setUsers(response.items);
    } catch (caughtError) {
      setUsersError(normalizeError(caughtError, "Could not load internal users."));
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    if (!landing) {
      return;
    }

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
        if (!cancelled) {
          setUsersError(normalizeError(caughtError, "Could not load internal users."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setUsersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [landing]);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Loading" text="Checking your session..." />
      </main>
    );
  }

  const nav = buildNav(landing);

  return (
    <AppShell nav={nav} title="Users">
      <div className="workspace">
        <PageHeader
          path="Users"
          title="Internal users"
          actions={
            <>
              <button
                className="button button--primary"
                type="button"
                onClick={() => setIsComposerOpen((value) => !value)}
              >
                {isComposerOpen ? "Hide form" : "Add new user"}
              </button>
              <button className="button button--secondary" type="button" onClick={() => void refreshUsers()}>
                Refresh list
              </button>
            </>
          }
        />

        {usersError ? <ScreenState kind="error" title="Could not load users" text={usersError} /> : null}
        {usersLoading ? <ScreenState kind="loading" title="Loading" text="Loading internal users..." /> : null}

        {!usersLoading && !usersError ? (
          users.length > 0 ? (
            <div className="stack-list">
              {users.map((user) => (
                <article className="candidate-card" key={user.id}>
                  <div className="candidate-card__top">
                    <strong>{user.name}</strong>
                    <span className="status">{formatRoleList(roleRegistry, user.roles)}</span>
                  </div>
                  <div className="candidate-card__meta">
                    <span>{user.email}</span>
                    <span>{user.created_by_user_id ? "Managed account" : "Unlinked account"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <ScreenState
              kind="empty"
              title="No managed users yet"
              text="Create a hiring manager or expert account to populate this list."
            />
          )
        ) : null}

        <section className="plain-section">
          <div className="section-heading">
            <div>
              <h2>User creation</h2>
            </div>
          </div>
          <InternalUserForm
            hidden={!isComposerOpen}
            onCreated={() => {
              setIsComposerOpen(false);
              void refreshUsers();
            }}
          />
        </section>
      </div>
    </AppShell>
  );
}
