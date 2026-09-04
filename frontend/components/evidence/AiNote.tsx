import type { ReactNode } from "react";

export function AiNote({
  children,
  title,
  label = "Система",
}: {
  children: ReactNode;
  title?: string;
  /** Recommendation uses «Система предлагает»; other AI notes use «Система». */
  label?: string;
}) {
  return (
    <section className="ai-note">
      <div className="ai-note__label">{label}</div>
      {title ? <h2 className="ai-note__title">{title}</h2> : null}
      <div className="ai-note__body">{children}</div>
    </section>
  );
}

export function HumanNote({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <section className="human-note">
      <div className="human-note__label">{label}</div>
      <div style={{ marginTop: 6 }}>{children}</div>
    </section>
  );
}
