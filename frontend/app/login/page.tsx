"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { ApiError } from "@/lib/api";
import { getRolePath, getSession, signIn } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session) {
      router.replace(getRolePath(session.user.role));
    }
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await signIn({ email, password });
      router.push(getRolePath(response.user.role));
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError("Could not sign in.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Internal / Login"
      title="Sign in to the internal workspace"
      description="Use your internal account."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Work email
          <input
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="field-error">{error}</p> : null}
        <div className="form-actions">
          <button className="button button--primary" type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
          <Link className="button button--secondary" href="/register">
            Create recruiter account
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
