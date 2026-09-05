"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useProtectedLanding } from "@/components/auth/protected-role-page";
import { AppShell } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import type { ManagerCandidate, RubricVersion } from "@/lib/api";
import { loadManagerCandidate, loadRubricVersions } from "@/lib/auth";
import { normalizeError } from "@/lib/errors";
import { buildNav } from "@/lib/nav";

const HIRING_MANAGER_AREA = "area.hiring_manager_review";

export default function ManagerCandidatePage() {
  const params = useParams<{ cid: string }>();
  const { landing, loading } = useProtectedLanding({ requiredArea: HIRING_MANAGER_AREA });
  const [candidate, setCandidate] = useState<ManagerCandidate | null>(null);
  const [rubric, setRubric] = useState<RubricVersion | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (!landing) {
      return;
    }
    let cancelled = false;

    async function loadCard() {
      try {
        const item = await loadManagerCandidate(params.cid);
        if (cancelled) {
          return;
        }
        setCandidate(item);
        if (item.interview.rubric_version_id) {
          try {
            const versions = await loadRubricVersions(item.interview.vacancy_id);
            if (cancelled) {
              return;
            }
            setRubric(versions.items.find((version) => version.id === item.interview.rubric_version_id) ?? null);
          } catch {
            if (!cancelled) {
              setRubric(null);
            }
          }
        }
      } catch (caughtError) {
        if (cancelled) {
          return;
        }
        if (caughtError instanceof ApiError && caughtError.status === 403) {
          setDenied(true);
        } else {
          setError(normalizeError(caughtError, "Не удалось открыть карточку."));
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    }

    void loadCard();
    return () => {
      cancelled = true;
    };
  }, [landing, params.cid]);

  if (loading || !landing) {
    return (
      <main className="workspace">
        <ScreenState kind="loading" title="Загрузка" text="Проверяем сессию…" />
      </main>
    );
  }

  const nav = buildNav(landing);

  if (denied) {
    return (
      <AppShell nav={nav} title="Менеджер">
        <div className="workspace">
          <ScreenState
            kind="error"
            title="Доступа к карточке нет"
            text="Этот кандидат вам ещё не передан. Дождитесь передачи или запроса мнения."
            action={
              <Button asChild variant="secondary">
                <Link href="/manager">К встречам</Link>
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  }

  if (pageLoading) {
    return (
      <AppShell nav={nav} title="Менеджер">
        <div className="workspace">
          <ScreenState kind="loading" title="Загрузка" text="Открываем карточку…" />
        </div>
      </AppShell>
    );
  }

  if (error || !candidate) {
    return (
      <AppShell nav={nav} title="Менеджер">
        <div className="workspace">
          <ScreenState
            kind="error"
            title="Карточка недоступна"
            text={error ?? "Кандидат не найден."}
            action={
              <Button asChild variant="secondary">
                <Link href="/manager">К встречам</Link>
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell nav={nav} title="Перед встречей">
      <div className="workspace">
        <PageHeader
          path="Встречи"
          title={candidate.interview.candidate_name ?? "Кандидат без имени"}
          description={
            <>
              <p>
                {candidate.vacancy_title}.{" "}
                {candidate.access === "handoff"
                  ? `Передал ${candidate.from_recruiter_name ?? "рекрутер"}: с человеком нужна встреча.`
                  : "Рекрутер спросил ваше мнение: кандидат вам не передан."}
              </p>
              <p className="muted-copy">
                Здесь только то, что нужно перед разговором. Прокторинга и оценки тут нет: решение
                принимает человек.
              </p>
            </>
          }
          actions={
            <Button asChild variant="secondary">
              <Link href="/manager">К встречам</Link>
            </Button>
          }
        />
        <section className="plain-section">
          <h2>Что передал рекрутер</h2>
          <p>{candidate.summary || "Рекрутер не оставил комментарий: смотрите отчёт."}</p>
        </section>
        {candidate.interview.rubric_version_id ? (
          <section className="plain-section">
            <h2>По какой версии требований оценивали</h2>
            {rubric ? (
              <p>
                Версия {rubric.version_number}
                {rubric.approved_at ? `, ${new Date(rubric.approved_at).toLocaleString("ru-RU", { day: "numeric", month: "long" })}` : ""}
              </p>
            ) : (
              <p>Версия {candidate.interview.rubric_version_id}</p>
            )}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
