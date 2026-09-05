"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { CalibrationSubnav } from "@/components/chrome/CalibrationSubnav";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SkeletonText } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { VacancyDetail, VacancyStatus } from "@/lib/api";
import { approveManagedVacancy, loadVacancy, requestManagedVacancyChanges } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, VACANCY_STATUS_LABEL } from "@/lib/nav";

const QUESTIONS_EDIT_ACTION = "action.questions.edit";
const APPROVABLE_STATUSES: VacancyStatus[] = ["calibration", "pending_review"];

function ApproveInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const vacancyId = params.id;
  const fromRecruiter = searchParams.get("from") === "recruiter";
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
      setStatus("Версия одобрена. Инвайт ещё закрыт — рекрутер должен нажать Активировать.");
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
              path={`Вакансии / ${vacancy.title}`}
              title="Утверждение версии"
              description={`Статус вакансии: ${VACANCY_STATUS_LABEL[vacancy.status] ?? vacancy.status}.`}
            />
            <CalibrationSubnav vacancyId={vacancyId} />
            {fromRecruiter ? <p>Только просмотр. Одобряет эксперт.</p> : null}
            {error ? <p className="form-error">{error}</p> : null}
            {status ? <p className="success-message">{status}</p> : null}
            {!canEdit && !fromRecruiter ? (
              <ScreenState
                kind="empty"
                title="Здесь нечего утверждать"
                text="Версию рубрики одобряет технический эксперт. Вам она доступна только для просмотра."
              />
            ) : null}
            {canEdit && !canApprove && !canRequestChanges ? (
              <ScreenState
                kind="empty"
                title="Версия уже утверждена"
                text="Вакансия в работе, менять версию не нужно. Если требования изменились, соберите новую версию на экране критериев."
              />
            ) : null}
            {canEdit ? (
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
                    Одобрить можно, когда вакансия на калибровке, в черновике или после извлечения требований.
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
