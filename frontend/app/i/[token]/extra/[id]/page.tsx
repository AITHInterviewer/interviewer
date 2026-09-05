"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { CandidateGate } from "@/components/chrome/CandidateGate";
import { ScreenState } from "@/components/chrome/ScreenState";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/field";
import { ApiError, fetchCandidateExtra, submitCandidateExtra } from "@/lib/api";
import { routeParam } from "@/lib/candidate-flow";

export default function ExtraPage() {
  const params = useParams<{ token: string; id: string }>();
  const token = routeParam(params.token);
  const extraId = routeParam(params.id);

  return (
    <CandidateGate token={token} current="Интервью">
      {(_info, accessToken) =>
        extraId ? (
          <ExtraBody token={accessToken} extraId={extraId} />
        ) : (
          <ScreenState kind="error" title="Такого уточнения нет" text="Проверьте ссылку целиком." />
        )
      }
    </CandidateGate>
  );
}

function ExtraBody({ token, extraId }: { token: string; extraId: string }) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [status, setStatus] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchCandidateExtra(token, extraId)
      .then((item) => {
        if (cancelled) return;
        setStatus(item.status);
        setLoadState("ready");
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof ApiError && caught.status === 404) {
          setLoadState("missing");
          return;
        }
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token, extraId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = answer.trim();
    if (!text) {
      setError("Напишите ответ, затем отправьте.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await submitCandidateExtra(token, extraId, text);
      setStatus(result.status);
      setSubmitted(true);
    } catch {
      setError("Не получилось отправить ответ. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  if (loadState === "loading") {
    return <ScreenState kind="loading" title="Открываем уточнение…" text="Это займёт пару секунд." />;
  }

  if (loadState === "missing") {
    return (
      <ScreenState
        kind="error"
        title="Такого уточнения нет"
        text="Проверьте ссылку целиком. Если письмо старое, напишите рекрутеру."
      />
    );
  }

  if (loadState === "error") {
    return (
      <ScreenState
        kind="error"
        title="Не получилось открыть уточнение"
        text="Проверьте соединение и откройте ссылку ещё раз."
      />
    );
  }

  const alreadyIn = status === "received" || status === "closed";

  return (
    <section className="setup-stage setup-stage--full">
      <p className="path">Уточнение</p>
      <h1>Короткий письменный ответ</h1>
      <p>
        Текст вопроса здесь недоступен. Используйте вопрос из сообщения рекрутера; если его нет,
        уточните перед отправкой.
      </p>
      <p>Срок письменного ответа в этой ссылке не указан.</p>
      {alreadyIn || submitted ? (
        <>
          <p className="success-message">Ответ принят.</p>
          <p>Новый текст с этой страницы отправлять не нужно — сохранённый ответ на сервере не показываем.</p>
        </>
      ) : (
        <form onSubmit={handleSubmit}>
          <Field label="Ваш ответ" error={error ?? undefined}>
            {({ id, describedBy, invalid }) => (
              <TextArea
                id={id}
                describedBy={describedBy}
                invalid={invalid}
                rows={6}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              />
            )}
          </Field>
          <div className="form-actions">
            <Button type="submit" disabled={busy || answer.trim() === ""}>
              {busy ? "Отправляем…" : "Отправить ответ"}
            </Button>
          </div>
          {answer.trim() === "" ? (
            <p className="disabled-hint">Введите ответ, чтобы отправить его</p>
          ) : null}
        </form>
      )}
    </section>
  );
}
