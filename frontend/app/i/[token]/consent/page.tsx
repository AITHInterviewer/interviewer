"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import { routeParam } from "@/lib/candidate-flow";

/**
 * Согласие/проверка/правила/практика были отдельными шагами, теперь это один экран
 * "Настройка" на `/i/[token]` (см. InterviewFlow.tsx) — страница оставлена редиректом
 * ради уже отправленных кандидатам ссылок на этот шаг.
 */
export default function ConsentPage() {
  const token = routeParam(useParams<{ token: string }>().token);
  const router = useRouter();

  useEffect(() => {
    if (token) router.replace(`/i/${token}`);
  }, [token, router]);

  return null;
}
