import type { AgentPresence } from "@/lib/livekit-client";

import styles from "./InterviewerOrb.module.css";

const STATUS_COPY: Record<AgentPresence, { label: string; announcement: string }> = {
  absent: { label: "Подключаем…", announcement: "Подключаем интервьюера…" },
  present: { label: "Слушает вас", announcement: "Интервьюер слушает вас" },
  speaking: { label: "Говорит…", announcement: "Интервьюер говорит…" },
};

export function InterviewerOrb({ presence }: { presence: AgentPresence }) {
  const status = STATUS_COPY[presence];

  return (
    <div className={styles.tile} data-state={presence} role="status" aria-label={status.announcement}>
      <div className={styles.content} aria-hidden="true">
        <span className={styles.orb}>
          <span className={styles.core} />
          <span className={styles.voiceCore} />
        </span>
        <span className={styles.label}>{status.label}</span>
      </div>
    </div>
  );
}
