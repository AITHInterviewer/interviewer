"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

import { routeParam } from "@/lib/candidate-flow";

/** См. .../consent/page.tsx — этот шаг слит в единый экран "Настройка" на `/i/[token]`. */
export default function CheckPage() {
  const token = routeParam(useParams<{ token: string }>().token);
  const router = useRouter();

  useEffect(() => {
    if (token) router.replace(`/i/${token}`);
  }, [token, router]);

  return null;
}
