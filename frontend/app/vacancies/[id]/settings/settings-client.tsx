"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { AssigneeField } from "@/components/chrome/AssigneeField";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/overlay";
import type { InternalUser, VacancyDetail } from "@/lib/api";
import {
  archiveManagedVacancy,
  getSession,
  loadInternalUsers,
  loadVacancy,
  pauseManagedVacancy,
  resumeManagedVacancy,
  updateManagedVacancy,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, GRADE_OPTIONS, vacancyBreadcrumbs, VACANCY_STATUS_LABEL } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";


export function VacancySettingsClient({ vacancyId }: { vacancyId: string }) {
  const { landing, loading } = useProtectedLanding({ requiredArea: RECRUITER_AREA });
  const currentUser = getSession()?.user;

  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [vacancyLoading, setVacancyLoading] = useState(true);
  const [vacancyError, setVacancyError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [grade, setGrade] = useState("");
  const [expertId, setExpertId] = useState<string | null>(null);
  const [hiringManagerId, setHiringManagerId] = useState<string | null>(null);
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    if (!landing) {
      return;
    }

    let cancelled = false;

    loadVacancy(vacancyId)
      .then((detail) => {
        if (cancelled) {
          return;
        }
        setVacancy(detail);
        setTitle(detail.title);
        setDescription(detail.description);
        setGrade(detail.grade);
        setExpertId(detail.expert_id ?? null);
        setHiringManagerId(detail.hiring_manager_id ?? null);
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setVacancyError(normalizeError(caughtError, "Не удалось открыть вакансию."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVacancyLoading(false);
        }
      });

    void loadInternalUsers()
      .then((response) => {
        if (!cancelled) {
          setUsers(response.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsers([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [landing, vacancyId]);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Проверяю доступ" text="Секунду, читаю вашу сессию." />
      </main>
    );
  }

  async function runLifecycle(
    run: () => Promise<{ status: VacancyDetail["status"] }>,
    fallback: string,
    successText: string,
  ): Promise<boolean> {
    setLifecycleBusy(true);
    setError(null);
    setStatus(null);
    try {
      const updated = await run();
      setVacancy((current) => (current ? { ...current, ...updated } : current));
      setStatus(successText);
      return true;
    } catch (caughtError) {
      setError(normalizeError(caughtError, fallback));
      return false;
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus(null);

    try {
      const updated = await updateManagedVacancy(vacancyId, {
        title,
        description,
        grade,
        expertId,
        hiringManagerId,
      });
      setVacancy((current) => (current ? { ...current, ...updated } : current));
      setStatus("Изменения сохранены.");
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось сохранить изменения."));
    } finally {
      setSubmitting(false);
    }
  }

  const nav = buildNav(landing);

  return (
    <AppShell nav={nav} title="Настройки вакансии">
      <div className="workspace workspace--form">
        <PageHeader
          breadcrumbs={vacancyBreadcrumbs(vacancyId, vacancy?.title ?? vacancyId, "Настройки")}
          title="Настройки"
        />

        {vacancyLoading ? <ScreenState kind="loading" title="Загружаю" text="Открываю вакансию." /> : null}
        {vacancyError ? <ScreenState kind="error" title="Вакансия не открылась" text={vacancyError} /> : null}

        {!vacancyLoading && vacancy ? (
          <>
          <section className="form-panel">
            <div className="form-surface">
            <h2>Статус вакансии</h2>
            <p>Сейчас: {VACANCY_STATUS_LABEL[vacancy.status] ?? vacancy.status}.</p>
            {vacancy.status === "active" ||
            vacancy.status === "paused" ||
            vacancy.status === "approved" ? (
              <div className="form-actions">
                {vacancy.status === "active" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={lifecycleBusy}
                    onClick={() =>
                      void runLifecycle(
                        () => pauseManagedVacancy(vacancyId),
                        "Не удалось поставить на паузу.",
                        "Вакансия на паузе.",
                      )
                    }
                  >
                    Приостановить
                  </Button>
                ) : null}
                {vacancy.status === "paused" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={lifecycleBusy}
                    onClick={() =>
                      void runLifecycle(
                        () => resumeManagedVacancy(vacancyId),
                        "Не удалось возобновить вакансию.",
                        "Вакансия снова активна.",
                      )
                    }
                  >
                    Возобновить
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" disabled={lifecycleBusy} onClick={() => setArchiveOpen(true)}>
                  Архивировать
                </Button>
              </div>
            ) : (
              <p className="disabled-hint">
                Пауза и архив доступны, когда вакансия одобрена, активна или уже на паузе.
              </p>
            )}
            </div>
          </section>

          <form className="form-panel form-surface" onSubmit={handleSubmit}>
            <label>
              Название
              <input value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label>
              Описание
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
            </label>
            <label>
              Грейд
              <select value={grade} onChange={(event) => setGrade(event.target.value)}>
                {(GRADE_OPTIONS.some((option) => option.value === grade)
                  ? GRADE_OPTIONS
                  : [...GRADE_OPTIONS, { value: grade, label: grade }]
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {/* Состав требований живёт на своём экране — здесь его дублировать нельзя:
                required_skills теперь производные от требований и перезапишутся. */}
            <p className="disabled-hint">
              Требования вакансии — на <Link href={`/vacancies/${vacancyId}/rubric`}>отдельном экране</Link>.
            </p>
            <AssigneeField
              label="Эксперт"
              roleCode="expert"
              users={users}
              value={expertId}
              onChange={setExpertId}
              currentUserId={currentUser?.id}
            />
            <AssigneeField
              label="Менеджер"
              roleCode="hiring_manager"
              users={users}
              value={hiringManagerId}
              onChange={setHiringManagerId}
              currentUserId={currentUser?.id}
            />
            {error ? <p className="form-error">{error}</p> : null}
            {status ? <p className="success-message">{status}</p> : null}
            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={submitting}>
                Сохранить
              </button>
            </div>
          </form>

          <Modal open={archiveOpen} title="Архивировать вакансию?" onClose={() => setArchiveOpen(false)}>
            <p>
              «{vacancy.title}» уйдёт из активных. Новых приглашений не будет. Уже выданные ссылки мы
              не отменяем — кандидаты смогут продолжить, если интервью ещё не завершено.
            </p>
            {error ? <p className="form-error">{error}</p> : null}
            <ModalActions>
              <Button type="button" variant="secondary" data-modal-initial-focus onClick={() => setArchiveOpen(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                loading={lifecycleBusy}
                loadingLabel="Архивируем…"
                onClick={() =>
                  void runLifecycle(
                    () => archiveManagedVacancy(vacancyId),
                    "Не удалось архивировать вакансию.",
                    "Вакансия в архиве.",
                  ).then((ok) => {
                    if (ok) setArchiveOpen(false);
                  })
                }
              >
                Архивировать
              </Button>
            </ModalActions>
          </Modal>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
