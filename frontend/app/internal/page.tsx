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
      <section className="loading-panel">
        <span className="status">Protected area</span>
        <strong>Checking your internal session...</strong>
        <p>If no active session is found, you will be redirected to sign in.</p>
      </section>
    </main>
  );
}
