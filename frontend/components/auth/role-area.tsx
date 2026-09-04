"use client";

import Link from "next/link";
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
  const primaryArea = landing.available_areas[0];

  return (
    <main className="auth-shell">
      <div className="page-title">
        <div>
          <p className="path">Internal / {landing.roles.join(", ")}</p>
          <h1>{primaryArea?.label ?? "Internal workspace"}</h1>
        </div>
        <div className="page-actions">
          <div className="profile-chip" aria-label="Current profile">
            <div className="profile-chip__body">
              <strong>{session.user.name}</strong>
              <span className="inline-code">{session.user.email}</span>
            </div>
            <span className="status">{landing.roles.join(", ")}</span>
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

      {landing.available_areas.length > 1 ? (
        <nav className="recruiter-tabs" aria-label="Available internal areas">
          {landing.available_areas.map((area) => (
            <Link key={area.id} className="recruiter-tab" href={area.path}>
              <span>{area.label}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {landing.available_actions.length > 0 ? (
        <section className="placeholder-card role-main-card">
          <span className="status">Available actions</span>
          <p>{landing.available_actions.join(", ")}</p>
        </section>
      ) : null}

      {children ? <section className="placeholder-card role-main-card">{children}</section> : null}
    </main>
  );
}
