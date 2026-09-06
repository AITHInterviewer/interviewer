"use client";

import { useState } from "react";

/** Ввод навыков тегами: Enter/запятая добавляет бабл, Backspace на пустом поле
 * убирает последний. Список навыков живёт у вызывающего — компонент только
 * рендерит текущие теги + поле ввода. */
export function SkillTagInput({
  label,
  skills,
  onChange,
  placeholder,
}: {
  label: string;
  skills: string[];
  onChange: (skills: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function addSkills(values: string[]) {
    const merged = [...skills];
    for (const value of values) {
      const trimmed = value.trim();
      if (trimmed && !merged.includes(trimmed)) {
        merged.push(trimmed);
      }
    }
    if (merged.length !== skills.length) {
      onChange(merged);
    }
  }

  function commitDraft() {
    addSkills([draft]);
    setDraft("");
  }

  // Запятая коммитит навык сразу — так работает и обычная печать, и вставка
  // «python, sql, docker» одним куском; последний кусок без запятой остаётся
  // черновиком до Enter/blur.
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    if (!value.includes(",")) {
      setDraft(value);
      return;
    }
    const parts = value.split(",");
    addSkills(parts.slice(0, -1));
    setDraft(parts[parts.length - 1]);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
    } else if (event.key === "Backspace" && draft === "" && skills.length > 0) {
      onChange(skills.slice(0, -1));
    }
  }

  function removeSkill(skill: string) {
    onChange(skills.filter((item) => item !== skill));
  }

  return (
    <label>
      {label}
      <span className="skill-tag-input">
        {skills.map((skill) => (
          <span className="tag skill-tag" key={skill}>
            {skill}
            <button
              type="button"
              className="skill-tag__remove"
              aria-label={`Убрать «${skill}»`}
              onClick={() => removeSkill(skill)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="skill-tag-input__field"
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          placeholder={skills.length === 0 ? placeholder : undefined}
        />
      </span>
    </label>
  );
}
