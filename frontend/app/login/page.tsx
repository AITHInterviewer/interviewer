"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { getSession, resolveLandingPath, signIn } from "@/lib/auth";

const CREDENTIALS_ERROR = "Не удалось войти. Проверьте почту и пароль";
const SERVICE_ERROR = "Не удалось связаться с сервисом. Повторите попытку";

function loginErrorMessage(caughtError: unknown): string {
  if (caughtError instanceof ApiError && caughtError.status === 401) {
    return CREDENTIALS_ERROR;
  }
  return SERVICE_ERROR;
}

export default function LoginPage() {
  const router = useRouter();
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
      const response = await signIn({ email, password });
      router.push(await resolveLandingPath(response.access_token));
    } catch (caughtError) {
      setError(loginErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Вход для сотрудников"
      title="Вход в рабочий кабинет"
      description="Используйте рабочую почту и пароль, выданные для доступа"
    >
      <form className="form-surface" onSubmit={handleSubmit}>
        <label>
          Рабочая почта
          <input
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Пароль
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
        <p className="disabled-hint">
          <a href="mailto:help@napoleon-it.ru">Нужна помощь со входом?</a>
        </p>
        <div className="form-actions">
          <Button type="submit" variant="primary" loading={submitting}>
            Войти
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
