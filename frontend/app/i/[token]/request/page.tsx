"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";

import { CandidateGate } from "@/components/chrome/CandidateGate";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/field";
import { routeParam } from "@/lib/candidate-flow";

const storageKey = (token: string) => `candidate-request:${token}`;

function readStored(token: string): string {
  try {
    const raw = window.localStorage.getItem(storageKey(token));
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { text?: string };
    return parsed.text?.trim() ? parsed.text : "";
  } catch {
    try {
      window.localStorage.removeItem(storageKey(token));
    } catch {
      // snapshot не должен падать, даже если хранилище недоступно
    }
    return "";
  }
}

export default function RequestPage() {
  const token = routeParam(useParams<{ token: string }>().token);

  return (
    <CandidateGate token={token} current="Интервью">
      {(_info, accessToken) => <RequestBody token={accessToken} />}
    </CandidateGate>
  );
}

function RequestBody({ token }: { token: string }) {
  const stored = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    () => readStored(token),
    () => "",
  );
  const [text, setText] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<"saved" | "copied" | "deleted" | null>(null);
  const value = text ?? stored;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = value.trim();
    if (!next) {
      setFieldError("Напишите текст заметки.");
      setActionError(null);
      setStatus(null);
      return;
    }
    try {
      window.localStorage.setItem(
        storageKey(token),
        JSON.stringify({ text: next, at: new Date().toISOString() }),
      );
      setText(next);
      setFieldError(null);
      setActionError(null);
      setStatus("saved");
    } catch {
      setFieldError(null);
      setActionError("Не удалось сохранить заметку в этом браузере.");
      setStatus(null);
    }
  }

  async function handleCopy() {
    setFieldError(null);
    const writeText = navigator.clipboard?.writeText;
    if (!writeText) {
      setStatus(null);
      setActionError("Не удалось скопировать. Выделите текст в поле и скопируйте вручную.");
      return;
    }
    try {
      await writeText.call(navigator.clipboard, value);
      setActionError(null);
      setStatus("copied");
    } catch {
      setStatus(null);
      setActionError("Не удалось скопировать. Выделите текст в поле и скопируйте вручную.");
    }
  }

  function handleDelete() {
    try {
      window.localStorage.removeItem(storageKey(token));
      setText("");
      setFieldError(null);
      setActionError(null);
      setStatus("deleted");
    } catch {
      setStatus(null);
      setActionError("Не удалось удалить заметку в этом браузере.");
    }
  }

  return (
    <section className="setup-stage setup-stage--full">
      <p className="path">Черновик заметки</p>
      <h1>Текст для себя</h1>
      <p>Текст сохранится только в этом браузере. Рекрутер его не получит.</p>
      <form onSubmit={handleSubmit}>
        <Field label="Заметка" error={fieldError ?? undefined}>
          {({ id, describedBy, invalid }) => (
            <TextArea
              id={id}
              describedBy={describedBy}
              invalid={invalid}
              rows={6}
              value={value}
              onChange={(event) => {
                setText(event.target.value);
                setFieldError(null);
                setActionError(null);
                setStatus(null);
              }}
            />
          )}
        </Field>
        <div className="form-actions">
          <Button type="submit">Сохранить заметку</Button>
          <Button type="button" variant="secondary" onClick={() => void handleCopy()}>
            Скопировать текст
          </Button>
          <Button type="button" variant="secondary" onClick={handleDelete}>
            Удалить заметку
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/i/${token}/done`}>Назад</Link>
          </Button>
        </div>
        {actionError ? (
          <p className="field__error" role="alert">
            {actionError}
          </p>
        ) : null}
      </form>
      {status === "saved" ? (
        <p className="pilot-hint" role="status">
          Сохранено в этом браузере
        </p>
      ) : null}
      {status === "copied" ? (
        <p className="pilot-hint" role="status">
          Текст скопирован
        </p>
      ) : null}
      {status === "deleted" ? (
        <p className="pilot-hint" role="status">
          Заметка удалена в этом браузере
        </p>
      ) : null}
    </section>
  );
}
