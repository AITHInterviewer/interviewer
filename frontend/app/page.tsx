"use client";

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
      <section className="loading-panel" role="status">
        <strong>Открываю кабинет</strong>
        <p>Если вы ещё не вошли, откроется страница входа.</p>
      </section>
    </main>
  );
}
