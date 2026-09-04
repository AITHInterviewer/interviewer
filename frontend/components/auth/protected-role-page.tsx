"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { RoleArea } from "@/components/auth/role-area";
import { getRolePath, loadLanding, type StoredSession } from "@/lib/auth";
import type { InternalRole, LandingResponse } from "@/lib/api";

type ProtectedRolePageProps = {
  expectedRole?: InternalRole;
  children?: React.ReactNode;
};

export function ProtectedRolePage({ expectedRole, children }: ProtectedRolePageProps) {
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

      if (expectedRole && result.session.user.role !== expectedRole) {
        router.replace(getRolePath(result.session.user.role));
        return;
      }

      setState(result);
      setLoading(false);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [expectedRole, router]);

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
