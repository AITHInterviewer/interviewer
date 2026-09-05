"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import type { VacancyDetail } from "@/lib/api";
import { createManagedVacancy, generateVacancyQuestions, sendManagedVacancyToExpert } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";

const RECRUITER_AREA = "area.recruiter_workspace";

function splitSkills(value: string): string[] {
  return value
    .split(",")
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
}

export default function NewVacancyPage() {
  const router = useRouter();
  const { landing, loading } = useProtectedLanding({ requiredArea: RECRUITER_AREA });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [grade, setGrade] = useState("");
  const [requiredSkills, setRequiredSkills] = useState("");
  const [niceToHaveSkills, setNiceToHaveSkills] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<VacancyDetail | null>(null);
  const [sending, setSending] = useState(false);
  const [sentStatus, setSentStatus] = useState<string | null>(null);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const vacancy = await createManagedVacancy({
        title,
        description,
        grade,
        requiredSkills: splitSkills(requiredSkills),
        niceToHaveSkills: splitSkills(niceToHaveSkills),
      });
      const generated = await generateVacancyQuestions(vacancy.id);
      setPreview(generated);
    } catch (caughtError) {
      setError(normalizeError(caughtError, "Не удалось создать вакансию или собрать вопросы."));
    } finally {
      setSubmitting(false);
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
          title="Новая вакансия"
          description="Навыки указывайте через запятую. После сборки вопросов версию можно отправить эксперту."
        />

        {!preview ? (
          <form className="form-surface" onSubmit={handleSubmit}>
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
              <input value={grade} onChange={(event) => setGrade(event.target.value)} required />
            </label>
            <label>
              Обязательные навыки
              <input
                value={requiredSkills}
                onChange={(event) => setRequiredSkills(event.target.value)}
                placeholder="python, sql"
              />
            </label>
            <label>
              Желательные навыки
              <input
                value={niceToHaveSkills}
                onChange={(event) => setNiceToHaveSkills(event.target.value)}
                placeholder="docker, kubernetes"
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={submitting}>
                {submitting ? "Собираем вопросы…" : "Создать и собрать вопросы"}
              </button>
            </div>
          </form>
        ) : (
          <section className="form-surface">
            <p className="path">{preview.title}</p>
            <h2>Требования и вопросы</h2>
            <p>
              Обязательные навыки: {preview.required_skills.join(", ") || "не указаны"}. Грейд:{" "}
              {preview.grade}.
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
