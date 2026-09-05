"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { ApiError } from "@/lib/api";
import { getSession, resolveLandingPath, signUpRecruiter } from "@/lib/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session) {
      router.replace("/internal");
    }
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await signUpRecruiter({ name, email, password });
      router.push(await resolveLandingPath(response.access_token));
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError("Could not create the recruiter account.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Internal / Register"
      title="Create the first recruiter account"
      description="Create a recruiter account to get started."
    >
      <form className="form-surface" onSubmit={handleSubmit}>
        <label>
          Full name
          <input name="name" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
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
        {error ? <p className="form-error">{error}</p> : null}
        <div className="form-actions">
          <button className="button button--primary" type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Create recruiter account"}
          </button>
          <Link className="button button--secondary" href="/login">
            I already have access
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
