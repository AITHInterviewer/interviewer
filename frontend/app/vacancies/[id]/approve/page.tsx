"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { CalibrationSubnav } from "@/components/chrome/CalibrationSubnav";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ViewModeBanner } from "@/components/chrome/ViewModeBanner";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SkeletonText } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { VacancyDetail, VacancyStatus } from "@/lib/api";
import { approveManagedVacancy, loadVacancy, requestManagedVacancyChanges } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, isRecruiterViewMode, vacancyBreadcrumbs, VACANCY_STATUS_LABEL } from "@/lib/nav";

const QUESTIONS_EDIT_ACTION = "action.questions.edit";
const APPROVABLE_STATUSES: VacancyStatus[] = ["calibration", "pending_review"];

function ApproveInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const vacancyId = params.id;
  const fromRecruiter = isRecruiterViewMode(searchParams.get("from"));
  const { landing, loading } = useProtectedLanding();

  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [vacancyLoading, setVacancyLoading] = useState(true);

  const canEdit = (landing?.available_actions.includes(QUESTIONS_EDIT_ACTION) ?? false) && !fromRecruiter;
  const canApprove = vacancy ? APPROVABLE_STATUSES.includes(vacancy.status) : false;
  const canRequestChanges = vacancy?.status === "calibration" || vacancy?.status === "pending_review";

  useEffect(() => {
    if (!landing) {
      return;
    }
    let cancelled = false;
    loadVacancy(vacancyId)
      .then((detail) => {
        if (!cancelled) {
          setVacancy(detail);
        }
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(normalizeError(caughtError, "Не удалось загрузить вакансию."));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setVacancyLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [landing, vacancyId]);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const updated = await approveManagedVacancy(vacancyId);
      setVacancy((current) => (current ? { ...current, ...updated } : current));
      setStatus("Версия одобрена. Приглашения пока недоступны: рекрутер должен активировать вакансию");
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось одобрить версию."));
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestChanges() {
    if (!reason.trim()) {
      setError("Нужна причина, чтобы запросить изменения.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const updated = await requestManagedVacancyChanges(vacancyId, reason.trim());
      setVacancy((current) => (current ? { ...current, ...updated } : current));
      setStatus("Запрос изменений отправлен рекрутеру.");
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось запросить изменения."));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  return (
    <AppShell nav={buildNav(landing)} title="Утверждение">
      <div className="workspace workspace--form">
        {vacancyLoading ? <SkeletonText lines={3} label="Загружаю версию" /> : null}
        {vacancy ? (
          <>
            <PageHeader
              breadcrumbs={vacancyBreadcrumbs(vacancyId, vacancy.title, "Утверждение")}
              title="Утверждение версии"
              description={`Статус вакансии: ${VACANCY_STATUS_LABEL[vacancy.status] ?? vacancy.status}.`}
            />
            <CalibrationSubnav vacancyId={vacancyId} />
            {fromRecruiter ? <ViewModeBanner /> : null}
            {!canEdit && !fromRecruiter ? (
              <p>Режим просмотра. Утверждение доступно эксперту</p>
            ) : null}
            {error ? <p className="form-error">{error}</p> : null}
            {status ? <p className="success-message">{status}</p> : null}
            <section>
              <p className="path">{vacancy.title}</p>
              <p>Статус: {VACANCY_STATUS_LABEL[vacancy.status] ?? vacancy.status}</p>
              <p>Вопросов в комплекте: {vacancy.questions.length}</p>
              <p>
                Обязательные навыки: {vacancy.required_skills.join(", ") || "не указаны"}
              </p>
            </section>
            {vacancy.questions.length === 0 ? (
              <ScreenState
                kind="empty"
                title="Комплект ещё не собран"
                text="Вопросов в этой версии пока нет."
              />
            ) : null}
            {canEdit && vacancy.questions.length > 0 && !canApprove ? (
              <ScreenState
                kind="empty"
                title="Версия уже одобрена"
                text="Вакансия не на калибровке. Если требования изменились, соберите новую версию на экране критериев."
              />
            ) : null}
            {canEdit && vacancy.questions.length > 0 ? (
              <>
                <div className="form-actions">
                  <Button
                    type="button"
                    disabled={!canApprove}
                    loading={busy}
                    loadingLabel="Сохраняю…"
                    onClick={() => void handleApprove()}
                  >
                    Одобрить версию
                  </Button>
                </div>
                {!canApprove ? (
                  <p className="disabled-hint">
                    Одобрить можно только когда вакансия на калибровке.
                  </p>
                ) : null}
                <label>
                  Причина изменений
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} required />
                </label>
                <div className="form-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || !canRequestChanges || !reason.trim()}
                    onClick={() => void handleRequestChanges()}
                  >
                    Запросить изменения
                  </Button>
                </div>
                {!canRequestChanges ? (
                  <p className="disabled-hint">Запросить изменения можно только на калибровке.</p>
                ) : !reason.trim() ? (
                  <p className="disabled-hint">Сначала напишите причину — без неё запрос не отправится.</p>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function VacancyApprovePage() {
  return (
    <Suspense fallback={<ScreenState kind="loading" title="Загрузка" text="Открываем утверждение…" />}>
      <ApproveInner />
    </Suspense>
  );
}
