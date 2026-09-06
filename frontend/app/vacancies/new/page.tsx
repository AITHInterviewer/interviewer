"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { AssigneeField } from "@/components/chrome/AssigneeField";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { SkillTagInput } from "@/components/chrome/SkillTagInput";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/shadcn/popover";
import { AvatarGroup, type AvatarPerson } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { InternalUser, VacancyDetail } from "@/lib/api";
import {
  createManagedVacancy,
  generateVacancyQuestions,
  getSession,
  loadInternalUsers,
  sendManagedVacancyToExpert,
} from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav, GRADE_OPTIONS, gradeLabel } from "@/lib/nav";
import { useToast } from "@/lib/toast";

const RECRUITER_AREA = "area.recruiter_workspace";
const MIN_REQUIRED_SKILLS = 3;

export default function NewVacancyPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const { landing, loading } = useProtectedLanding({ requiredArea: RECRUITER_AREA });
  const currentUser = getSession()?.user;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [grade, setGrade] = useState("unspecified");
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [niceToHaveSkills, setNiceToHaveSkills] = useState<string[]>([]);
  const [users, setUsers] = useState<InternalUser[]>([]);
  // По умолчанию создающий назначается на роли, доступные ему — но это можно
  // снять или передать другому уже на этом экране.
  const [expertId, setExpertId] = useState<string | null>(
    currentUser?.roles.includes("expert") ? currentUser.id : null,
  );
  const [hiringManagerId, setHiringManagerId] = useState<string | null>(
    currentUser?.roles.includes("hiring_manager") ? currentUser.id : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<VacancyDetail | null>(null);
  const [sending, setSending] = useState(false);
  const [sentStatus, setSentStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!landing) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInternalUsers()
      .then((response) => setUsers(response.items))
      .catch(() => setUsers([]));
  }, [landing]);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  const assignedPeople: AvatarPerson[] = [
    ...(currentUser ? [{ name: currentUser.name, role: "Рекрутер" }] : []),
    ...(expertId
      ? [{ name: users.find((user) => user.id === expertId)?.name ?? "?", role: "Эксперт" }]
      : []),
    ...(hiringManagerId
      ? [{ name: users.find((user) => user.id === hiringManagerId)?.name ?? "?", role: "Менеджер" }]
      : []),
  ];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (requiredSkills.length < MIN_REQUIRED_SKILLS) {
      setError(`Укажите хотя бы ${MIN_REQUIRED_SKILLS} обязательных навыка.`);
      return;
    }

    setSubmitting(true);

    let vacancy;
    try {
      vacancy = await createManagedVacancy({
        title,
        description,
        grade,
        requiredSkills,
        niceToHaveSkills,
        expertId,
        hiringManagerId,
      });
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось создать вакансию."));
      setSubmitting(false);
      return;
    }

    try {
      const generated = await generateVacancyQuestions(vacancy.id);
      setPreview(generated);
      setSubmitting(false);
    } catch {
      // Вакансия уже создана — сборку вопросов можно повторить со страницы
      // самой вакансии, второй раз создавать её не нужно.
      pushToast(
        "warning",
        `Вакансия «${vacancy.title}» создана, но вопросы не собрались. Соберите их на странице вакансии.`,
      );
      router.push(`/vacancies/${vacancy.id}`);
    }
  }

  async function handleSendToExpert() {
    if (!preview) {
      return;
    }
    setSending(true);
    setError(null);
    setSentStatus(null);
    try {
      await sendManagedVacancyToExpert(preview.id);
      setSentStatus("Версия ушла эксперту на калибровку. Письмо мы не отправляем.");
      router.push(`/vacancies/${preview.id}`);
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось отправить эксперту."));
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell nav={buildNav(landing)} title="Новая вакансия">
      <div className="workspace workspace--form">
        <PageHeader
          path="Вакансии / Новая"
          title={
            <span className="vacancy-title-row">
              <input
                className="vacancy-title-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Название вакансии"
                aria-label="Название вакансии"
                required
              />
              <select
                className="vacancy-grade-select"
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                aria-label="Грейд"
              >
                {GRADE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="vacancy-assignees-trigger"
                    aria-label="Назначить людей на вакансию"
                  >
                    {assignedPeople.length > 0 ? (
                      <AvatarGroup people={assignedPeople} />
                    ) : (
                      <span className="avatar avatar--placeholder">+</span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="vacancy-assignees-popover" align="start">
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
            </span>
          }
        />

        {!preview ? (
          <form className="form-surface form-panel" onSubmit={handleSubmit}>
            <label>
              Описание
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
            </label>
            <div className="skills-columns">
              <SkillTagInput
                label={`Обязательные навыки (минимум ${MIN_REQUIRED_SKILLS})`}
                skills={requiredSkills}
                onChange={setRequiredSkills}
                placeholder="python, sql, docker…"
              />
              <SkillTagInput
                label="Желательные навыки"
                skills={niceToHaveSkills}
                onChange={setNiceToHaveSkills}
                placeholder="docker, kubernetes…"
              />
            </div>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={submitting}>
                {submitting ? "Собираем вопросы…" : "Создать вакансию"}
              </button>
            </div>
          </form>
        ) : (
          <section className="form-surface form-panel">
            <p className="path">{preview.title}</p>
            <h2>Требования и вопросы</h2>
            <p>
              Обязательные навыки: {preview.required_skills.join(", ") || "не указаны"}. Грейд:{" "}
              {gradeLabel(preview.grade)}.
            </p>
            {preview.questions.length > 0 ? (
              <ol>
                {preview.questions.map((question) => (
                  <li key={question.id}>{question.text}</li>
                ))}
              </ol>
            ) : (
              <p>Вопросы не пришли. Открыть вакансию и проверить можно после отправки или с доски.</p>
            )}
            {error ? <p className="form-error">{error}</p> : null}
            {sentStatus ? <p className="success-message">{sentStatus}</p> : null}
            <div className="form-actions">
              <Button type="button" disabled={sending} onClick={() => void handleSendToExpert()}>
                {sending ? "Отправляем…" : "Отправить эксперту"}
              </Button>
            </div>
            <p className="disabled-hint">Эксперт увидит эту версию в очереди калибровки. Мы не шлём письмо за вас.</p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
