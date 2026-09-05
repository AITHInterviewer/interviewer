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
    window.localStorage.removeItem(storageKey(token));
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
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = text ?? stored;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = value.trim();
    if (!next) {
      setError("Напишите, о чём спросить рекрутера.");
      setSaved(false);
      return;
    }
    window.localStorage.setItem(
      storageKey(token),
      JSON.stringify({ text: next, at: new Date().toISOString() }),
    );
    setText(next);
    setError(null);
    setSaved(true);
  }

  return (
    <section className="setup-stage setup-stage--full">
      <p className="path">Запрос рекрутеру</p>
      <h1>Что нужно уточнить</h1>
      <p>
        Напишите вопрос или комментарий. Сейчас это сохраняется только у вас в браузере: отдельной
        отправки на сервер ещё нет.
      </p>
      <form onSubmit={handleSubmit}>
        <Field label="Сообщение" error={error ?? undefined}>
          {({ id, describedBy, invalid }) => (
            <TextArea
              id={id}
              describedBy={describedBy}
              invalid={invalid}
              rows={6}
              value={value}
              onChange={(event) => {
                setText(event.target.value);
                setSaved(false);
              }}
            />
          )}
        </Field>
        <div className="form-actions">
          <Button type="submit" disabled={value.trim() === ""}>
            Записать у себя
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/i/${token}/done`}>Назад</Link>
          </Button>
        </div>
      </form>
      {saved || (text === null && stored !== "") ? (
        <p className="pilot-hint">
          Заявка записана у вас на устройстве, рекрутер получит её в следующей версии.
        </p>
      ) : null}
    </section>
  );
}
