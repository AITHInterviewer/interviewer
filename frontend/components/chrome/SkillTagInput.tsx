"use client";

import { useId, useState } from "react";

/** Ввод навыков тегами: Enter/запятая добавляет бабл, Backspace на пустом поле
 * убирает последний. Список навыков живёт у вызывающего — компонент только
 * рендерит текущие теги + поле ввода.
 * Внешний блок — не <label>: клик по подписи форвардился бы на первый
 * focusable-элемент внутри (кнопку «×») и молча удалял первый тег. */
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
  const inputId = useId();

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

  // Запятая, пробел или вставка списком коммитят навык сразу — «python sql docker»
  // одним куском (или через запятую) разваливается на теги; последний кусок без
  // разделителя остаётся черновиком до Enter/blur.
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    const parts = value.split(/[,\s]+/);
    if (parts.length === 1) {
      setDraft(value);
      return;
    }
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
    <span className="skill-tag-field">
      <label htmlFor={inputId}>{label}</label>
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
          id={inputId}
          className="skill-tag-input__field"
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          placeholder={skills.length === 0 ? placeholder : undefined}
        />
      </span>
    </span>
  );
}
