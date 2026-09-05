"use client";

import { useEffect, useState } from "react";

import { InternalUserForm } from "@/components/auth/internal-user-form";
import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
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
      setUsersError(normalizeError(caughtError, "Не удалось загрузить сотрудников."));
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
          setUsersError(normalizeError(caughtError, "Не удалось загрузить сотрудников."));
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
        <ScreenState kind="loading" title="Проверяю доступ" text="Секунду, читаю вашу сессию." />
      </main>
    );
  }

  const nav = buildNav(landing);

  return (
    <AppShell nav={nav} title="Пользователи">
      <div className="workspace">
        <PageHeader
          path="Администратор"
          title="Сотрудники"
          actions={
            <>
              <button
                className="button button--primary"
                type="button"
                onClick={() => setIsComposerOpen((value) => !value)}
              >
                {isComposerOpen ? "Свернуть форму" : "Завести сотрудника"}
              </button>
              <button className="button button--secondary" type="button" onClick={() => void refreshUsers()}>
                Обновить список
              </button>
            </>
          }
        />

        {usersError ? <ScreenState kind="error" title="Не удалось загрузить сотрудников" text={usersError} /> : null}
        {usersLoading ? <SkeletonList count={3} label="Загружаю сотрудников" /> : null}

        {!usersLoading && !usersError ? (
          users.length > 0 ? (
            <div className="stack-list">
              {users.map((user) => (
                <article className="candidate-card" key={user.id}>
                  <div className="candidate-card__top">
                    <strong>{user.name}</strong>
                    <StatusPill tone="neutral">{formatRoleList(roleRegistry, user.roles)}</StatusPill>
                  </div>
                  <div className="candidate-card__meta">
                    <span>{user.email}</span>
                    <span>{user.created_by_user_id ? "Аккаунт завёл администратор" : "Аккаунт создан при регистрации"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <ScreenState
              kind="empty"
              title="Сотрудников пока нет"
              text="Заведите эксперта или нанимающего менеджера, чтобы они могли работать в кабинете."
            />
          )
        ) : null}

        <section className="plain-section">
          <div className="section-heading">
            <div>
              <h2>Новый сотрудник</h2>
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
