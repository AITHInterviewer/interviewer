"use client";

import { Play, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

export function EvidenceLink({
  quote,
  timecode,
  questionLabel,
  found,
}: {
  quote: string;
  timecode: string | null;
  questionLabel?: string;
  found: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!found || !timecode) {
    return (
      <div>
        {quote ? <blockquote>«{quote}»</blockquote> : null}
        <span className="no-source">цитата не подтверждена транскриптом</span>
      </div>
    );
  }

  const label = questionLabel ? `${questionLabel} · ${timecode}` : timecode;

  return (
    <div>
      <blockquote>«{quote}»</blockquote>
      <button className="time-link" type="button" onClick={() => setOpen(true)}>
        <Play size={15} weight="fill" />
        {label}
      </button>
      {open ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Фрагмент ответа">
          <div className="modal-card" style={{ maxWidth: 560 }}>
            <div className="section-heading">
              <h2>Фрагмент {label}</h2>
              <button className="icon-button icon-button--small" type="button" onClick={() => setOpen(false)} aria-label="Закрыть">
                <X size={16} />
              </button>
            </div>
            <div className="clip-player">
              <p className="clip-player__meta">Контекст ±15 секунд. В демо это запись-заглушка.</p>
              <div className="wave-bars wave-bars--live" aria-hidden="true">
                {[2, 6, 4, 8, 5, 3, 7, 4, 6, 2, 5, 8].map((height, index) => (
                  <i key={index} style={{ height: `${height * 5}px` }} />
                ))}
              </div>
              <p className="clip-player__time">{timecode}</p>
              <blockquote>«{quote}»</blockquote>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
