"use client";

import { useParams } from "next/navigation";

import { InterviewFlow } from "@/components/interview/InterviewFlow";
import { routeParam } from "@/lib/candidate-flow";

/**
 * Основная ссылка кандидата (`candidate_link` из backend/app/services/interview_admin_service.py
 * — `/i/{access_token}`). Раньше здесь была отдельная страница-приглашение перед
 * согласием/проверкой/правилами/практикой (5 экранов) — весь этот путь схлопнут в
 * один экран "Настройка" внутри InterviewFlow (см. lib/candidate-flow.ts).
 */
export default function CandidateEntryPage() {
  const token = routeParam(useParams<{ token: string }>().token);
  if (!token) return null;
  return <InterviewFlow token={token} />;
}
