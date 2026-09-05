"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import { routeParam } from "@/lib/candidate-flow";

/**
 * Разминка убрана из флоу по решению продукта (не часть интервью, лишний шаг) —
 * страница оставлена редиректом ради уже отправленных кандидатам ссылок.
 */
export default function PracticePage() {
  const token = routeParam(useParams<{ token: string }>().token);
  const router = useRouter();

  useEffect(() => {
    if (token) router.replace(`/i/${token}`);
  }, [token, router]);

  return null;
}
