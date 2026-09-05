"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { RoleArea } from "@/components/auth/role-area";
import { loadLanding, type StoredSession } from "@/lib/auth";
import type { LandingResponse } from "@/lib/api";

type ProtectedRolePageProps = {
  requiredArea?: string;
  children?: React.ReactNode;
};

export function ProtectedRolePage({ requiredArea, children }: ProtectedRolePageProps) {
  const router = useRouter();
  const [state, setState] = useState<{
    session: StoredSession;
    landing: LandingResponse;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const result = await loadLanding();
      if (cancelled) {
        return;
      }

      if (!result) {
        router.replace("/login");
        return;
      }

      if (
        requiredArea &&
        !result.landing.available_areas.some((area) => area.id === requiredArea)
      ) {
        router.replace(result.landing.default_path);
        return;
      }

      setState(result);
      setLoading(false);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [requiredArea, router]);

  if (loading || !state) {
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

  return <RoleArea session={state.session} landing={state.landing}>{children}</RoleArea>;
}
