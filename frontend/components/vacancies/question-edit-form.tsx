"use client";

import { useState } from "react";

import type {
  Question,
  QuestionDifficulty,
  QuestionFormat,
  QuestionInput,
  QuestionRole,
} from "@/lib/api";

const QUESTION_FORMATS: QuestionFormat[] = ["voice", "code_review_verbal", "live_coding"];
const QUESTION_ROLES: QuestionRole[] = ["assessment", "warmup", "closing"];
const QUESTION_DIFFICULTIES: QuestionDifficulty[] = ["baseline", "stretch"];

export type QuestionFormState = {
  text: string;
  skillTag: string;
  intent: string;
  referenceAnswer: string;
  format: QuestionFormat;
  role: QuestionRole;
  difficulty: QuestionDifficulty;
  estimatedDurationSec: string;
};

export function emptyQuestionForm(): QuestionFormState {
  return {
    text: "",
    skillTag: "",
    intent: "",
    referenceAnswer: "",
    format: "voice",
    role: "assessment",
    difficulty: "baseline",
    estimatedDurationSec: "120",
  };
}

export function toQuestionInput(form: QuestionFormState, order: number): QuestionInput {
  return {
    text: form.text,
    order,
    skill_tag: form.skillTag
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    intent: form.intent,
    reference_answer: form.referenceAnswer,
    format: form.format,
    role: form.role,
    difficulty: form.difficulty,
    estimated_duration_sec: Number(form.estimatedDurationSec) || 0,
  };
}

export function questionToForm(question: Question): QuestionFormState {
  return {
    text: question.text,
    skillTag: question.skill_tag?.join(", ") ?? "",
    intent: question.intent,
    referenceAnswer: question.reference_answer,
    format: question.format,
    role: question.role,
    difficulty: question.difficulty,
    estimatedDurationSec: String(question.estimated_duration_sec),
  };
}

export function QuestionEditForm({
  initial,
  submitLabel,
  submitting,
  onSubmit,
}: {
  initial: QuestionFormState;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (form: QuestionFormState) => void;
}) {
  const [form, setForm] = useState<QuestionFormState>(initial);

  function update<K extends keyof QuestionFormState>(key: K, value: QuestionFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      className="form-surface"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(form);
      }}
    >
      <label>
        Text
        <textarea value={form.text} onChange={(event) => update("text", event.target.value)} required />
      </label>
      <label>
        Skill tags (comma-separated)
        <input value={form.skillTag} onChange={(event) => update("skillTag", event.target.value)} />
      </label>
      <label>
        Intent
        <textarea value={form.intent} onChange={(event) => update("intent", event.target.value)} />
      </label>
      <label>
        Reference answer
        <textarea value={form.referenceAnswer} onChange={(event) => update("referenceAnswer", event.target.value)} />
      </label>
      <label>
        Format
        <select value={form.format} onChange={(event) => update("format", event.target.value as QuestionFormat)}>
          {QUESTION_FORMATS.map((format) => (
            <option key={format} value={format}>
              {format}
            </option>
          ))}
        </select>
      </label>
      <label>
        Role
        <select value={form.role} onChange={(event) => update("role", event.target.value as QuestionRole)}>
          {QUESTION_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </label>
      <label>
        Difficulty
        <select
          value={form.difficulty}
          onChange={(event) => update("difficulty", event.target.value as QuestionDifficulty)}
        >
          {QUESTION_DIFFICULTIES.map((difficulty) => (
            <option key={difficulty} value={difficulty}>
              {difficulty}
            </option>
          ))}
        </select>
      </label>
      <label>
        Estimated duration (seconds)
        <input
          type="number"
          value={form.estimatedDurationSec}
          onChange={(event) => update("estimatedDurationSec", event.target.value)}
        />
      </label>
      <div className="form-actions">
        <button className="button button--primary" type="submit" disabled={submitting}>
          {submitting ? "Сохраняю…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
