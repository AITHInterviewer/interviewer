"use client";

import { ApiError, postCandidateProgress, type CandidateInterviewInfo, type InterviewProductState } from "@/lib/api";

export function routeParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export const CANDIDATE_STEPS = [
  "Приглашение",
  "Согласие",
  "Проверка",
  "Правила",
  "Практика",
  "Интервью",
] as const;

export type CandidateStep = (typeof CANDIDATE_STEPS)[number];

export function isResumeOffered(info: CandidateInterviewInfo): boolean {
  return (
    info.status === "in_progress" ||
    info.product_state === "interrupted" ||
    info.product_state === "in_interview"
  );
}

export function resumeHref(token: string, info: CandidateInterviewInfo): string {
  if (!info.consented) {
    return `/i/${token}/consent`;
  }
  if (
    info.product_state === "device_checked" ||
    info.product_state === "ready" ||
    info.product_state === "in_interview" ||
    info.product_state === "interrupted"
  ) {
    return `/i/${token}/live`;
  }
  return `/i/${token}/check`;
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
