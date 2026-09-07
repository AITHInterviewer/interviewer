"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import type { Extension } from "@uiw/react-codemirror";

import type { ControlChannel } from "@/lib/control-channel";
import type { AgentPresence } from "@/lib/livekit-client";

/**
 * live_coding (specs/004-candidate-interview-flow, US4) — экран решения задачи вместо
 * обычной видео-карточки вопроса. Переход "решение -> объяснение" ведёт live-agent
 * голосом (кандидат говорит "я закончил"), поэтому здесь нет кнопки завершения — редактор
 * просто продолжает синхронизироваться весь вопрос, в т.ч. пока агент просит объяснить.
 */

const LANGUAGE_OPTIONS: { value: string; label: string; extension: () => Extension }[] = [
  { value: "python", label: "Python", extension: () => python() },
  { value: "javascript", label: "JavaScript", extension: () => javascript() },
  { value: "typescript", label: "TypeScript", extension: () => javascript({ typescript: true }) },
];

const DEFAULT_LANGUAGE = LANGUAGE_OPTIONS[0].value;
// Дебаунс перед отправкой candidate_input — то же сообщение backend пишет как очередной
// code_snapshot (interview_event_service.record_candidate_input) и пересылает live-agent
// (interview_ws.py) — отдельный клиентский таймер снапшотов не нужен.
const SYNC_DEBOUNCE_MS = 1500;

function resolveExtensions(language: string): Extension[] {
  const option = LANGUAGE_OPTIONS.find((candidate) => candidate.value === language);
  return option ? [option.extension()] : [];
}

export function CodeEditorPanel({
  questionId,
  questionText,
  language,
  channel,
  agentSubtitle,
  followUpText,
  agentPresence,
}: {
  questionId: string;
  questionText: string;
  /** `Question.stimulus.language` — язык уже задан вакансией, выбор языка не показываем. */
  language: string | null;
  channel: ControlChannel;
  /** Последняя реплика агента (subtitle_agent) — те же данные, что уже собирает InterviewRoom. */
  agentSubtitle: string | null;
  /** Чек-ин/доп. вопрос агента (в т.ч. подсказка во время решения) — приоритетнее subtitle. */
  followUpText: string | null;
  agentPresence: AgentPresence;
}) {
  const [selectedLanguage, setSelectedLanguage] = useState(language ?? DEFAULT_LANGUAGE);
  const [code, setCode] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Новый live_coding-вопрос — редактор и выбор языка (если он не задан вакансией) сбрасываются.
  useEffect(() => {
    setCode("");
    setSelectedLanguage(language ?? DEFAULT_LANGUAGE);
  }, [questionId, language]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const handleChange = (value: string) => {
    setCode(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      channel.sendCandidateInput({ question_id: questionId, input_format: "code", content: value });
    }, SYNC_DEBOUNCE_MS);
  };

  const extensions = useMemo(() => resolveExtensions(selectedLanguage), [selectedLanguage]);
  const followUp = followUpText ?? (agentSubtitle || null);

  return (
    <section className="setup-stage setup-stage--full flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-medium text-[var(--ink-secondary)]">Задача</h2>
          <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">{questionText}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-sm font-medium text-[var(--ink-secondary)]">Интервьюер</h2>
          <p className="mt-2 text-sm text-[var(--ink-secondary)]">
            {agentPresence === "speaking" ? "Говорит…" : "Слушает вас"}
          </p>
          {followUp ? <p className="mt-2 text-sm">{followUp}</p> : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--ink-secondary)]">
          <span>Редактор кода</span>
          {language ? (
            <span className="capitalize">{language}</span>
          ) : (
            <select
              value={selectedLanguage}
              onChange={(event) => setSelectedLanguage(event.target.value)}
              aria-label="Язык программирования"
              className="rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-sm"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <CodeMirror value={code} height="360px" extensions={extensions} onChange={handleChange} />
      </div>
    </section>
  );
}
