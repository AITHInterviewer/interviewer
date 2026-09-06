import type { ReactNode } from "react";

export function ScreenState({
  kind,
  title,
  text,
  action,
}: {
  kind: "loading" | "empty" | "error";
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={`screen-state screen-state--${kind}`}
      role={kind === "error" ? "alert" : "status"}
      aria-busy={kind === "loading" ? true : undefined}
    >
      <h2 className="screen-state__title">{title}</h2>
      <p className="screen-state__text">{text}</p>
      {action}
    </div>
  );
}
