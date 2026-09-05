"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { ApiError } from "@/lib/api";
import { getSession, resolveLandingPath, signIn } from "@/lib/auth";

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
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError("Не удалось войти. Проверьте почту и пароль.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Вход для сотрудников"
      title="Вход в рабочий кабинет"
      description="Рабочая почта и пароль, которые выдал администратор."
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
        {error ? (
          <>
            <p className="form-error">{error}</p>
            <p className="disabled-hint">
              Если пароль не подошёл, напишите на{" "}
              <a href="mailto:help@napoleon-it.ru">help@napoleon-it.ru</a>.
            </p>
          </>
        ) : null}
        <div className="form-actions">
          <button className="button button--primary" type="submit" disabled={submitting}>
            Войти
          </button>
          <button className="button button--secondary" type="button" disabled title="Самостоятельная регистрация выключена: аккаунт заводит администратор">
            Регистрация
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
