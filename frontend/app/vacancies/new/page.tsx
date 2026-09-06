"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { AssigneeField } from "@/components/chrome/AssigneeField";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/shadcn/popover";
import { Button } from "@/components/ui/button";
import { SkeletonText } from "@/components/ui/skeleton";
import {
  describeFileError,
  FileDrop,
  type FileDropState,
} from "@/components/vacancies/FileDrop";
import {
  checkedCount,
  MIN_CHECKED_REQUIREMENTS,
  RequirementsPanel,
} from "@/components/vacancies/RequirementsPanel";
import { DRAFT_FILE_KEY, readDraftFile } from "@/lib/vacancy-draft";
import type { ExtractedRequirements, InternalUser, Requirement } from "@/lib/api";
import {
  createManagedVacancy,
  extractVacancyRequirements,
  getSession,
  loadInternalUsers,
  sendManagedVacancyToExpert,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, GRADE_OPTIONS } from "@/lib/nav";
import { useToast } from "@/lib/toast";

const RECRUITER_AREA = "area.recruiter_workspace";

const EXTRACT_ERRORS: Record<string, string> = {
  pdf_no_text_layer:
    "Это скан: в файле нет текста, только картинка. Вставьте описание текстом ниже.",
  pdf_unreadable: "Файл повреждён или защищён паролем. Вставьте описание текстом ниже.",
  not_a_pdf: "Пока читаем только PDF. Сохраните файл как PDF или вставьте текст ниже.",
  file_too_large: "Файл больше 10 МБ. Вставьте описание текстом ниже.",
  empty_description: "Вставьте описание вакансии или приложите PDF.",
  extraction_failed:
    "Не удалось разобрать описание. Текст сохранён — попробуйте ещё раз или добавьте требования вручную.",
};

function explainExtractError(error: unknown): string {
  const raw = normalizeError(error, "extraction_failed");
  return EXTRACT_ERRORS[raw] ?? raw;
}

export default function NewVacancyPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { landing, loading } = useProtectedLanding({ requiredArea: RECRUITER_AREA });
  const currentUser = getSession()?.user;

  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [grade, setGrade] = useState("unspecified");
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [excluded, setExcluded] = useState<ExtractedRequirements["excluded"]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileState, setFileState] = useState<FileDropState>({ kind: "empty" });
  const [fileName, setFileName] = useState<string | null>(null);

  const [users, setUsers] = useState<InternalUser[]>([]);
  // По умолчанию создающий назначается на роли, доступные ему — но это можно
  // снять или передать другому уже на этом экране.
  const [expertId, setExpertId] = useState<string | null>(
    currentUser?.roles.includes("expert") ? currentUser.id : null,
  );
  const [hiringManagerId, setHiringManagerId] = useState<string | null>(
    currentUser?.roles.includes("hiring_manager") ? currentUser.id : null,
  );

  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyExtraction(payload: ExtractedRequirements) {
    setDescription(payload.description);
    if (payload.title) setTitle(payload.title);
    if (payload.grade) setGrade(payload.grade);
    setRequirements(payload.requirements);
    setExcluded(payload.excluded);
    setWarnings(payload.warnings);
    setStep(2);
  }

  const extractFromFile = useCallback(async (file: File) => {
    const fileError = describeFileError(file);
    if (fileError) {
      setFileState({ kind: "error", message: fileError, fileName: file.name });
      return;
    }
    setError(null);
    setFileState({ kind: "reading", fileName: file.name });
    setExtracting(true);
    try {
      const payload = await extractVacancyRequirements({ file });
      setFileState({ kind: "ready", fileName: file.name });
      setFileName(file.name);
      applyExtraction(payload);
    } catch (caughtError) {
      setFileState({ kind: "error", message: explainExtractError(caughtError), fileName: file.name });
    } finally {
      setExtracting(false);
    }
    // applyExtraction замыкает только сеттеры — они стабильны между рендерами.
  }, []);

  useEffect(() => {
    if (!landing) {
      return;
    }
    void loadInternalUsers()
      .then((response) => setUsers(response.items))
      .catch(() => setUsers([]));
  }, [landing]);

  // Файл, бро́шенный на список вакансий, приезжает сюда через sessionStorage: File
  // нельзя положить в query, а глобального стора в проекте нет.
  const draftPickedUp = useRef(false);
  useEffect(() => {
    if (!landing || draftPickedUp.current) {
      return;
    }
    draftPickedUp.current = true;
    const dropped = readDraftFile();
    window.sessionStorage.removeItem(DRAFT_FILE_KEY);
    if (dropped) {
      // Это запуск загрузки файла, а не синхронизация состояния: сеттеры вызывает уже
      // сам разбор, по мере его продвижения.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void extractFromFile(dropped);
    }
  }, [landing, extractFromFile]);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  const assignedExpert = expertId ? users.find((user) => user.id === expertId) : null;

  async function handleExtractText() {
    setError(null);
    setExtracting(true);
    try {
      applyExtraction(await extractVacancyRequirements({ description }));
    } catch (caughtError) {
      setError(explainExtractError(caughtError));
    } finally {
      setExtracting(false);
    }
  }

  async function handleSendToExpert() {
    setError(null);
    const unnamed = requirements.some((item) => item.checked && !item.name.trim());
    if (unnamed) {
      setError("У проверяемого требования пустое название — заполните или снимите галочку.");
      return;
    }

    setSubmitting(true);
    let vacancy;
    try {
      vacancy = await createManagedVacancy({
        title: title.trim(),
        description,
        grade,
        requiredSkills: [],
        niceToHaveSkills: [],
        requirements,
        descriptionSource: fileName ? "pdf" : "text",
        descriptionFileName: fileName,
        expertId,
        hiringManagerId,
      });
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось создать вакансию."));
      setSubmitting(false);
      return;
    }

    try {
      await sendManagedVacancyToExpert(vacancy.id);
      pushToast("success", `Вакансия «${vacancy.title}» ушла эксперту на калибровку.`);
    } catch {
      // Вакансия уже создана — второй раз её создавать не нужно, отправить эксперту
      // можно со страницы требований.
      pushToast(
        "warning",
        `Вакансия «${vacancy.title}» сохранена, но не ушла эксперту. Отправьте её со страницы требований.`,
      );
    }
    router.push(`/vacancies/${vacancy.id}/rubric`);
  }

  const canExtract = description.trim().length > 0 && !extracting;
  const checked = checkedCount(requirements);
  const notEnough = checked < MIN_CHECKED_REQUIREMENTS;

  return (
    <AppShell nav={buildNav(landing)} title="Новая вакансия">
      <div className="workspace workspace--form">
        <PageHeader
          path="Вакансии / Новая"
          title="Новая вакансия"
          description="Вставьте описание вакансии — найдём в нём требования, а вопросы соберутся после того, как эксперт их одобрит."
          actions={
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="assignee-trigger"
                  aria-label="Назначить людей на вакансию"
                >
                  <span className="assignee-trigger__role">Эксперт</span>
                  <span className="assignee-trigger__name">
                    {assignedExpert ? assignedExpert.name : "не назначен"}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="vacancy-assignees-popover" align="end">
                <PopoverTitle>Назначенные на вакансию</PopoverTitle>
                <div className="vacancy-assignee-row">
                  <span className="vacancy-assignee__role">Рекрутер</span>
                  <span className="vacancy-assignee__name">{currentUser?.name ?? "—"}</span>
                </div>
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
              </PopoverContent>
            </Popover>
          }
        />

        <nav className="workspace-subnav" aria-label="Шаги создания вакансии">
          <span data-active={step === 1 || undefined}>1 Описание</span>
          <button
            type="button"
            data-active={step === 2 || undefined}
            disabled={requirements.length === 0}
            title={requirements.length === 0 ? "Сначала извлеките требования из описания" : undefined}
            onClick={() => setStep(2)}
          >
            2 Требования
          </button>
        </nav>

        {step === 1 ? (
          <section className="form-surface form-panel">
            <FileDrop
              state={fileState}
              disabled={extracting}
              onFile={(file) => void extractFromFile(file)}
              onClear={() => {
                setFileState({ kind: "empty" });
                setFileName(null);
              }}
            />

            <label>
              Описание вакансии
              <textarea
                className="vacancy-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Middle+ Python Developer&#10;Обязанности:&#10;● Разработка и поддержка высоконагруженных микросервисов…"
              />
              <span className="disabled-hint">{description.length} символов</span>
            </label>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="form-actions">
              <Button
                type="button"
                loading={extracting}
                loadingLabel="Читаем описание…"
                disabled={!canExtract}
                onClick={() => void handleExtractText()}
              >
                Извлечь требования
              </Button>
              {!canExtract && !extracting ? (
                <span className="disabled-hint">Вставьте описание или приложите PDF</span>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <>
            <section className="form-surface form-panel vacancy-head-fields">
              <label>
                Название вакансии
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Python Developer"
                />
              </label>
              <label>
                Грейд
                <select value={grade} onChange={(event) => setGrade(event.target.value)}>
                  {GRADE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            {warnings.length > 0 ? (
              <div className="notice notice--warning" role="status">
                <strong>Проверьте описание</strong>
                <ul>
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {extracting ? (
              <div className="form-surface form-panel">
                <SkeletonText lines={5} label="Читаем описание" />
              </div>
            ) : requirements.length === 0 ? (
              <ScreenState
                kind="empty"
                title="Требований не нашлось"
                text="В описании не видно технических требований. Проверьте, что вставлен текст вакансии, или добавьте требования вручную."
                action={
                  <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                    Вернуться к описанию
                  </Button>
                }
              />
            ) : (
              <RequirementsPanel
                requirements={requirements}
                onChange={setRequirements}
                confirmLabel="Отправить эксперту"
                confirmLoadingLabel="Отправляем…"
                confirmDisabledReason={
                  notEnough
                    ? `Включите хотя бы ${MIN_CHECKED_REQUIREMENTS} требования — сейчас ${checked}`
                    : null
                }
                busy={submitting}
                onConfirm={() => void handleSendToExpert()}
                extraAction={
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setStep(1)}
                  >
                    К описанию
                  </button>
                }
              />
            )}

            {excluded.length > 0 ? (
              <details className="excluded-block">
                <summary>Не вошло в требования — {excluded.length}</summary>
                <ul>
                  {excluded.map((item) => (
                    <li key={item.text}>
                      <span>{item.text}</span>
                      <small>{item.reason}</small>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}

            {error ? <p className="form-error">{error}</p> : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
