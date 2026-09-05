"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { loadLanding } from "@/lib/auth";

export default function InternalEntryPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    void loadLanding().then((result) => {
      if (cancelled) {
        return;
      }
      if (!result) {
        router.replace("/login");
        return;
      }
      router.replace(result.landing.default_path);
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="auth-shell">
      <section className="loading-panel" role="status">
        <strong>Проверяю доступ</strong>
        <p>Если сессия закончилась, откроется страница входа.</p>
      </section>
    </main>
  );
}
