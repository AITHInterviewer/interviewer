"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal, ModalActions } from "@/components/ui/overlay";

import styles from "./VacancyDescription.module.css";

const PREVIEW_LIMIT = 240;
const MIN_SENTENCE_LENGTH = 110;

export function vacancyDescriptionPreview(description: string): {
  preview: string;
  truncated: boolean;
} {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (normalized.length <= PREVIEW_LIMIT) {
    return { preview: normalized, truncated: false };
  }

  const candidate = normalized.slice(0, PREVIEW_LIMIT + 1);
  const sentenceEnds = [...candidate.matchAll(/[.!?](?=\s|$)/g)];
  const sentenceEnd = sentenceEnds.findLast((match) => (match.index ?? 0) >= MIN_SENTENCE_LENGTH);
  const fallbackEnd = candidate.lastIndexOf(" ", PREVIEW_LIMIT);
  const end = sentenceEnd ? (sentenceEnd.index ?? PREVIEW_LIMIT) + 1 : Math.max(fallbackEnd, MIN_SENTENCE_LENGTH);

  return { preview: `${candidate.slice(0, end).trimEnd()}…`, truncated: true };
}

export function VacancyDescription({ title, description }: { title: string; description: string }) {
  const [open, setOpen] = useState(false);
  const { preview, truncated } = vacancyDescriptionPreview(description);

  return (
    <>
      <div className={styles.preview}>
        <p className={styles.previewText}>{preview || "Описание пока не добавлено."}</p>
        {truncated ? (
          <Button className={styles.openButton} type="button" variant="text" onClick={() => setOpen(true)}>
            Читать полностью
          </Button>
        ) : null}
      </div>

      <Modal open={open} title="Описание вакансии" onClose={() => setOpen(false)}>
        <div className={styles.dialogBody}>
          <p className={styles.vacancyTitle}>{title}</p>
          <p className={styles.fullText}>{description.trim()}</p>
        </div>
        <ModalActions>
          <Button type="button" variant="secondary" data-modal-initial-focus onClick={() => setOpen(false)}>
            Закрыть
          </Button>
        </ModalActions>
      </Modal>
    </>
  );
}
