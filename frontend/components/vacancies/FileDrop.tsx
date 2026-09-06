"use client";

import { FileArrowUp, FilePdf } from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";

import { Spinner } from "@/components/ui/spinner";

const MAX_BYTES = 10 * 1024 * 1024;

export type FileDropState =
  | { kind: "empty" }
  | { kind: "reading"; fileName: string }
  | { kind: "ready"; fileName: string }
  | { kind: "error"; message: string; fileName?: string };

function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

/** Причина отказа формулируется здесь, а не в вызывающем коде: сообщение должно стоять
 * рядом с полем, где ошибку и чинят. Формат «что → почему → что делать». */
export function describeFileError(file: File): string | null {
  if (file.size > MAX_BYTES) {
    return `Файл ${formatSize(file.size)}, помещается до 10 МБ. Обычно это скан — вставьте текст описания ниже.`;
  }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    const extension = file.name.includes(".") ? file.name.split(".").pop() : null;
    return `Это ${extension ? `.${extension}` : "не PDF"}. Пока читаем только PDF — сохраните файл как PDF или вставьте текст описания ниже.`;
  }
  return null;
}

export function FileDrop({
  state,
  onFile,
  onClear,
  disabled,
}: {
  state: FileDropState;
  onFile: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) {
      onFile(file);
    }
  }

  // Карточка выбранного файла — уже не зона сброса: файл выбран, дальше им управляют
  // кнопками, а не перетаскиванием.
  if (state.kind === "ready") {
    return (
      <div className="file-drop file-drop--ready">
        <FilePdf size={20} weight="regular" />
        <span className="file-drop__name">{state.fileName}</span>
        <span className="file-drop__actions">
          <button type="button" className="text-button" onClick={() => inputRef.current?.click()}>
            Заменить
          </button>
          <button type="button" className="text-button" onClick={onClear}>
            Убрать
          </button>
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf"
          className="file-drop__input"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
    );
  }

  if (state.kind === "reading") {
    return (
      <div className="file-drop file-drop--reading" role="status" aria-busy>
        <Spinner />
        <span className="file-drop__name">{state.fileName}</span>
        <span className="file-drop__hint">Читаем PDF…</span>
        <span className="file-drop__actions">
          <button type="button" className="text-button" onClick={onClear}>
            Отменить
          </button>
        </span>
      </div>
    );
  }

  const isError = state.kind === "error";

  return (
    <div
      className="file-drop"
      data-dragging={dragging || undefined}
      data-error={isError || undefined}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <FileArrowUp size={22} weight="regular" />
      {dragging ? (
        <p className="file-drop__title">Отпустите — прочитаем описание</p>
      ) : (
        <p className="file-drop__title">
          Перетащите PDF с описанием вакансии или{" "}
          <button
            type="button"
            className="inline-action"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            выберите файл
          </button>
        </p>
      )}
      {isError ? (
        <p className="form-error">{state.message}</p>
      ) : (
        <p className="file-drop__hint">PDF, до 10 МБ. Текст можно вставить и вручную — ниже.</p>
      )}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="application/pdf"
        className="file-drop__input"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
