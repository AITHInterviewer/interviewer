"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { CalibrationSubnav } from "@/components/chrome/CalibrationSubnav";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ViewModeBanner } from "@/components/chrome/ViewModeBanner";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SkeletonText } from "@/components/ui/skeleton";
import {
  estimateMinutes,
  MIN_REQUIREMENTS,
  RequirementsPanel,
  requirementsLabel,
} from "@/components/vacancies/RequirementsPanel";
import type { Requirement, RubricVersion, VacancyDetail } from "@/lib/api";
import {
  approveManagedVacancy,
  loadRubricVersions,
  loadVacancy,
  saveManagedRequirements,
  sendManagedVacancyToExpert,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, isRecruiterViewMode, vacancyBreadcrumbs, VACANCY_STATUS_LABEL } from "@/lib/nav";
import { useToast } from "@/lib/toast";

const QUESTIONS_EDIT_ACTION = "action.questions.edit";
const RECRUITER_AREA = "area.recruiter_workspace";
// Одно правило владения на весь экран — то же, что в backend/app/services/vacancy_service.py:
// до калибровки список у рекрутёра, на калибровке у эксперта, дальше зафиксирован.
const RECRUITER_TURN = new Set(["draft", "extracted", "changes_requested"]);
const EXPERT_TURN = new Set(["calibration", "pending_review"]);

const APPROVE_ERRORS: Record<string, string> = {
  question_generation_failed:
    "Не удалось собрать вопросы. Требования сохранены — попробуйте ещё раз.",
  not_enough_requirements: `Нужно хотя бы ${MIN_REQUIREMENTS} требования, прежде чем отправлять эксперту.`,
  requirements_not_yours:
    "Вакансию уже забрал в работу другой участник — обновите страницу, чтобы увидеть актуальный список.",
  requirements_locked: "Вакансия уже запущена — список требований зафиксирован.",
  "Invalid vacancy transition.":
    "Вакансия уже ушла эксперту — обновите страницу, чтобы увидеть текущий статус.",
};

function explainApproveError(error: unknown): string {
  const raw = normalizeError(error, "question_generation_failed");
  if (raw.startsWith("questions_missing_requirements:")) {
    const missing = raw.split(":").slice(1).join(":").trim();
    return `Модель не задала вопрос по требованиям: ${missing}. Попробуйте ещё раз или переформулируйте требование.`;
  }
  return APPROVE_ERRORS[raw] ?? raw;
}

function snapshotText(snapshot?: Record<string, unknown>): string {
  const skills = snapshot?.required_skills;
  if (Array.isArray(skills) && skills.every((item) => typeof item === "string")) {
    return skills.join(", ") || "Требования в этой версии не перечислены.";
  }
  return "В этой версии список требований не сохранился.";
}

function RubricInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { pushToast } = useToast();
  const vacancyId = params.id;
  const fromRecruiter = isRecruiterViewMode(searchParams.get("from"));
  const { landing, loading } = useProtectedLanding();

  const [vacancy, setVacancy] = useState<VacancyDetail | null>(null);
  const [versions, setVersions] = useState<RubricVersion[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vacancyLoading, setVacancyLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!landing) {
      return;
    }
    let cancelled = false;
    Promise.all([loadVacancy(vacancyId), loadRubricVersions(vacancyId)])
      .then(([detail, versionResponse]) => {
        if (cancelled) {
          return;
        }
        setVacancy(detail);
        setVersions(versionResponse.items);
        setRequirements(detail.requirements ?? []);
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(normalizeError(caughtError, "Не удалось загрузить требования."));
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

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  const isExpert = (landing.available_actions.includes(QUESTIONS_EDIT_ACTION) ?? false) && !fromRecruiter;
  const isRecruiter = landing.available_areas.some((area) => area.id === RECRUITER_AREA);
  const status = vacancy?.status ?? "draft";
  // Ход эксперта: калибрует и запускает. Ход рекрутёра: собирает список и отдаёт эксперту.
  // Если сейчас не ваш ход — экран только читается, и главной кнопки на нём нет вовсе.
  const expertTurn = isExpert && EXPERT_TURN.has(status);
  const recruiterTurn = isRecruiter && !isExpert && RECRUITER_TURN.has(status);
  // Мультиролевой пользователь (рекрутёр и эксперт разом) на своих статусах ходит за обоих.
  const recruiterTurnMultirole = isRecruiter && isExpert && RECRUITER_TURN.has(status);
  const myTurn = expertTurn || recruiterTurn || recruiterTurnMultirole;
  const editable = myTurn;
  const minutes = estimateMinutes(requirements);
  const notEnough = requirements.length < MIN_REQUIREMENTS;

  // Почему кнопки нет — говорим прямо, чтобы экран не выглядел сломанным.
  const waitingHint = EXPERT_TURN.has(status)
    ? "Требования у эксперта — он проверит список, соберёт вопросы и запустит вакансию."
    : RECRUITER_TURN.has(status)
      ? "Список ещё собирает рекрутёр — эксперту он пока не отправлен."
      : `Вакансия уже ${(VACANCY_STATUS_LABEL[status] ?? status).toLowerCase()} — список зафиксирован.`;

  async function persistRequirements() {
    const updated = await saveManagedRequirements(vacancyId, requirements);
    setVacancy((current) => (current ? { ...current, ...updated } : current));
    setDirty(false);
  }

  async function handleApprove() {
    setError(null);
    setBusy(true);
    try {
      if (dirty) {
        await persistRequirements();
      }
      const updated = await approveManagedVacancy(vacancyId);
      setVacancy((current) => (current ? { ...current, ...updated } : current));
      pushToast("success", "Вакансия активна — можно приглашать кандидатов.");
      router.push(`/vacancies/${vacancyId}/questions`);
    } catch (caughtError) {
      setError(explainApproveError(caughtError));
    } finally {
      setBusy(false);
    }
  }

  async function handleSendToExpert() {
    setError(null);
    setBusy(true);
    try {
      if (dirty) {
        await persistRequirements();
      }
      const updated = await sendManagedVacancyToExpert(vacancyId);
      setVacancy((current) => (current ? { ...current, ...updated } : current));
      pushToast("success", "Требования ушли эксперту на калибровку.");
    } catch (caughtError) {
      setError(explainApproveError(caughtError));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setError(null);
    setBusy(true);
    try {
      await persistRequirements();
      pushToast("success", "Требования сохранены.");
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось сохранить требования."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell nav={buildNav(landing)} title="Требования">
      <div className="workspace">
        {vacancyLoading ? <SkeletonText lines={4} label="Загружаю требования" /> : null}
        {vacancy ? (
          <>
            <PageHeader
              breadcrumbs={vacancyBreadcrumbs(vacancyId, vacancy.title, "Требования")}
              title="Требования"
              description={
                expertTurn
                  ? "Правьте формулировки, уровни и состав. Вопросы соберутся сами, когда вы одобрите список."
                  : myTurn
                    ? "Список, который проверим на интервью. Отправьте его эксперту — он калибрует и запустит вакансию."
                    : waitingHint
              }
            />
            <CalibrationSubnav vacancyId={vacancyId} />
            {fromRecruiter ? <ViewModeBanner /> : null}

            {error ? <p className="form-error">{error}</p> : null}

            {requirements.length === 0 ? (
              <ScreenState
                kind="empty"
                title="Требований нет"
                text="У этой вакансии не заполнены требования — обычно так у вакансий, созданных до разбора описания. Откройте настройки вакансии и добавьте описание заново."
              />
            ) : (
              <RequirementsPanel
                requirements={requirements}
                onChange={(next) => {
                  setRequirements(next);
                  setDirty(true);
                }}
                readOnly={!editable}
                busy={busy}
                confirmLabel={
                  expertTurn
                    ? "Одобрить требования и запустить"
                    : myTurn
                      ? "Отправить эксперту"
                      : null
                }
                confirmLoadingLabel={expertTurn ? "Собираем вопросы…" : "Отправляем…"}
                confirmHint={
                  !myTurn
                    ? waitingHint
                    : expertTurn
                      ? `${requirementsLabel(requirements.length)} · ≈${minutes} мин интервью · после одобрения соберём вопросы и вакансия станет активной`
                      : `${requirementsLabel(requirements.length)} · ≈${minutes} мин интервью`
                }
                confirmDisabledReason={
                  myTurn && notEnough
                    ? `Нужно хотя бы ${MIN_REQUIREMENTS} требования — сейчас ${requirements.length}`
                    : null
                }
                onConfirm={() => void (expertTurn ? handleApprove() : handleSendToExpert())}
                extraAction={
                  editable && dirty ? (
                    <button type="button" className="text-button" onClick={() => void handleSave()}>
                      Сохранить черновик
                    </button>
                  ) : null
                }
              />
            )}

            {versions.length > 0 ? (
              <section className="plain-section">
                <h2>Ранее одобренные версии</h2>
                <ul className="stack-list">
                  {versions.map((version) => (
                    <li key={version.id}>
                      <strong>Версия {version.version_number}</strong>
                      <p>
                        {version.approved_at
                          ? new Date(version.approved_at).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })
                          : "Дата одобрения не указана"}
                      </p>
                      <p>{snapshotText(version.snapshot)}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : error ? (
          <ScreenState kind="error" title="Не открылось" text={error} />
        ) : null}
      </div>
    </AppShell>
  );
}

export default function VacancyRubricPage() {
  return (
    <Suspense fallback={<ScreenState kind="loading" title="Загрузка" text="Открываем требования…" />}>
      <RubricInner />
    </Suspense>
  );
}
