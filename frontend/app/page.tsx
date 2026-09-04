"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { getSession } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const session = getSession();
    router.replace(session ? "/internal" : "/login");
  }, [router]);

  return (
    <main className="auth-shell">
      <section className="loading-panel">
        <span className="status">Internal access</span>
        <strong>Preparing your workspace...</strong>
        <p>If you are not signed in yet, the app will send you to the login page.</p>
        <Link className="button button--ghost" href="/interview/demo">
          Open candidate route
        </Link>
      </section>
    </main>
  );
}
