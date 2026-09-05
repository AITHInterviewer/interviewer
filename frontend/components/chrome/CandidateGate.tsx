"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { ScreenState } from "@/components/chrome/ScreenState";
import { ApiError, fetchCandidateInterview, type CandidateInterviewInfo } from "@/lib/api";
import { CANDIDATE_STEPS, type CandidateStep } from "@/lib/candidate-flow";

export function CandidateFrame({
  current,
  vacancyTitle,
  children,
}: {
  current: CandidateStep;
  vacancyTitle?: string;
  children: ReactNode;
}) {
  return (
    <CandidateShell steps={[...CANDIDATE_STEPS]} current={current} vacancyTitle={vacancyTitle}>
      {children}
    </CandidateShell>
  );
}

export function CandidateGate({
  token,
  current,
  redirectCompleted = false,
  requireConsented = false,
  children,
}: {
  token: string | undefined;
  current: CandidateStep;
  redirectCompleted?: boolean;
  requireConsented?: boolean;
  children: (info: CandidateInterviewInfo, token: string) => ReactNode;
}) {
  const router = useRouter();
  const [info, setInfo] = useState<CandidateInterviewInfo | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchCandidateInterview(token)
      .then((data) => {
        if (cancelled) return;
        if (data.product_state === "expired" || data.product_state === "data_deleted") {
          router.replace("/i/expired");
          return;
        }
        if (redirectCompleted && data.status === "completed") {
          router.replace(`/i/${token}/done`);
          return;
        }
        if (requireConsented && !data.consented) {
          router.replace(`/i/${token}/consent`);
          return;
        }
        setInfo(data);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          router.replace("/i/expired");
          return;
        }
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token, router, redirectCompleted, requireConsented]);

  if (!token || loadState === "loading" || (loadState === "ready" && !info)) {
    return (
      <CandidateFrame current={current}>
        <ScreenState kind="loading" title="Загружаем…" text="Это займёт пару секунд." />
      </CandidateFrame>
    );
  }

  if (loadState === "error" || !info) {
    return (
      <CandidateFrame current={current}>
        <ScreenState
          kind="error"
          title="Не получилось открыть интервью"
          text="Проверьте соединение и откройте ссылку ещё раз."
        />
      </CandidateFrame>
    );
  }

  return (
    <CandidateFrame current={current} vacancyTitle={info.vacancy_title}>
      {children(info, token)}
    </CandidateFrame>
  );
}
