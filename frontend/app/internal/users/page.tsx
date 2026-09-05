"use client";

import { useEffect, useMemo, useState } from "react";

import { InternalUserForm } from "@/components/auth/internal-user-form";
import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SearchField, Toolbar } from "@/components/chrome/Toolbar";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import type { InternalUser } from "@/lib/api";
import { loadInternalUsers, loadRoleRegistry, updateManagedUserRoles } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, USERS_MANAGE_ACTION } from "@/lib/nav";
import {
  assignedRegistryRoles,
  formatRoleList,
  roleTitle,
  type RoleRegistryEntry,
} from "@/lib/roles";

export default function InternalUsersPage() {
  const { landing, loading } = useProtectedLanding({ requiredAction: USERS_MANAGE_ACTION });

  const [users, setUsers] = useState<InternalUser[]>([]);
  const [roleRegistry, setRoleRegistry] = useState<RoleRegistryEntry[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busyRole, setBusyRole] = useState<{ userId: string; role: string } | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return users;
    }
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle),
    );
  }, [users, query]);

  async function removeRole(user: InternalUser, roleCode: string) {
    const assigned = assignedRegistryRoles(roleRegistry, user.roles);
    if (assigned.length < 2 || !assigned.includes(roleCode)) {
      return;
    }
    setBusyRole({ userId: user.id, role: roleCode });
    setRoleError(null);
    try {
      const updated = await updateManagedUserRoles(user.id, { removeRoles: [roleCode] });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caughtError) {
      setRoleError(normalizeError(caughtError, "Не удалось снять роль."));
    } finally {
      setBusyRole(null);
    }
  }

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
          path="Пользователи"
          title="Пользователи"
          description={
            landing.available_actions.includes(USERS_MANAGE_ACTION)
              ? "Доступы сотрудников. Управление списком — право этой сессии, а не отдельная роль."
              : "Доступы сотрудников"
          }
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

        {!usersLoading && !usersError && users.length > 0 ? (
          <Toolbar>
            <SearchField
              label="Поиск по имени или почте"
              placeholder="Имя или почта"
              value={query}
              onChange={setQuery}
            />
            <span className="toolbar__count">Найдено: {visible.length}</span>
          </Toolbar>
        ) : null}

        {roleError ? <p className="form-error">{roleError}</p> : null}

        {!usersLoading && !usersError ? (
          users.length === 0 ? (
            <ScreenState
              kind="empty"
              title="Сотрудников пока нет"
              text="Заведите эксперта или нанимающего менеджера, чтобы они могли работать в кабинете."
            />
          ) : visible.length === 0 ? (
            <ScreenState
              kind="empty"
              title="Никого не нашли"
              text="Смените запрос: сотрудники есть, но имя или почта не совпали."
            />
          ) : (
            <div className="stack-list">
              {visible.map((user) => {
                const assignedRoles = assignedRegistryRoles(roleRegistry, user.roles);
                const lastRole = assignedRoles.length === 1;
                return (
                  <article className="candidate-card" key={user.id}>
                    <div className="candidate-card__top">
                      <strong>{user.name}</strong>
                      <StatusPill tone="neutral">{formatRoleList(roleRegistry, assignedRoles)}</StatusPill>
                    </div>
                    <div className="candidate-card__meta">
                      <span>{user.email}</span>
                      <span>
                        {user.created_by_user_id ? "Аккаунт создан вручную" : "Аккаунт создан при регистрации"}
                      </span>
                    </div>
                    <div className="form-actions">
                      {assignedRoles.map((code) => {
                        const thisBusy = busyRole?.userId === user.id && busyRole.role === code;
                        return (
                          <Button
                            key={code}
                            type="button"
                            variant="secondary"
                            disabled={lastRole || busyRole?.userId === user.id}
                            loading={thisBusy}
                            onClick={() => void removeRole(user, code)}
                          >
                            Снять роль «{roleTitle(roleRegistry, code)}»
                          </Button>
                        );
                      })}
                    </div>
                    {lastRole ? (
                      <p className="disabled-hint">Нужна хотя бы одна роль, поэтому снять последнюю нельзя.</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
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
