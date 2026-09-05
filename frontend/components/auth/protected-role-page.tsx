"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { LandingResponse } from "@/lib/api";
import { loadLanding, type StoredSession } from "@/lib/auth";

export type LandingState = {
  session: StoredSession;
  landing: LandingResponse;
};

/**
 * Shared session/capability gate for every internal page: redirects to /login when there is
 * no active session, and (when `requiredArea` and/or `requiredAction` is given) redirects to
 * the user's own landing `default_path` when they lack that capability. Pages that need more
 * flexible checks (e.g. "either of two capabilities", or "show read-only content but hide
 * edit controls") call this with no requirement and check the returned `landing` themselves.
 */
export function useProtectedLanding(options?: { requiredArea?: string; requiredAction?: string }) {
  const router = useRouter();
  const [state, setState] = useState<LandingState | null>(null);
  const [loading, setLoading] = useState(true);
  const requiredArea = options?.requiredArea;
  const requiredAction = options?.requiredAction;

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

      const missingArea =
        !!requiredArea && !result.landing.available_areas.some((area) => area.id === requiredArea);
      const missingAction =
        !!requiredAction && !result.landing.available_actions.includes(requiredAction);

      if (missingArea || missingAction) {
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
  }, [requiredArea, requiredAction, router]);

  return { session: state?.session, landing: state?.landing, loading };
}
