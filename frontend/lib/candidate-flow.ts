"use client";

import { ApiError, postCandidateProgress, type CandidateInterviewInfo, type InterviewProductState } from "@/lib/api";

export function routeParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Дата дедлайна из API. Пустая или битая строка → null, без заглушки. */
export function formatDeadlineDate(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

// Флоу сокращён до трёх шагов (было 6: Приглашение/Согласие/Проверка/Правила/Практика/
// Интервью) — см. InterviewFlow.tsx: экран согласия, экран проверки устройств, само
// интервью. Практика убрана совсем.
export const CANDIDATE_STEPS = ["Согласие", "Устройства", "Интервью"] as const;

export type CandidateStep = (typeof CANDIDATE_STEPS)[number];

export function isResumeOffered(info: CandidateInterviewInfo): boolean {
  return (
    info.status === "in_progress" ||
    info.product_state === "interrupted" ||
    info.product_state === "in_interview"
  );
}

export function resumeHref(token: string, info: CandidateInterviewInfo): string {
  if (
    info.product_state === "ready" ||
    info.product_state === "in_interview" ||
    info.product_state === "interrupted"
  ) {
    return `/i/${token}/live`;
  }
  return `/i/${token}`;
}

export async function markForwardProgress(
  token: string,
  productState: InterviewProductState,
): Promise<void> {
  try {
    await postCandidateProgress(token, productState);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 409 || error.status === 422)) {
      return;
    }
    throw error;
  }
}
