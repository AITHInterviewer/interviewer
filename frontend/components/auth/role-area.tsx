"use client";

import { useRouter } from "next/navigation";

import { clearSession, type StoredSession } from "@/lib/auth";
import type { LandingResponse } from "@/lib/api";

type RoleAreaProps = {
  session: StoredSession;
  landing: LandingResponse;
  children?: React.ReactNode;
};

export function RoleArea({ session, landing, children }: RoleAreaProps) {
  const router = useRouter();

  return (
    <main className="auth-shell">
      <div className="page-title">
        <div>
          <p className="path">Internal / {landing.role}</p>
          <h1>{landing.title}</h1>
          <p className="page-title__description">{landing.description}</p>
        </div>
        <div className="page-actions">
          <div className="profile-chip" aria-label="Current profile">
            <div className="profile-chip__body">
              <strong>{session.user.name}</strong>
              <span className="inline-code">{session.user.email}</span>
            </div>
            <span className="status">{session.user.role}</span>
          </div>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              clearSession();
              router.push("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {children ? <section className="placeholder-card role-main-card">{children}</section> : null}
    </main>
  );
}
