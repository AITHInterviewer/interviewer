import type { ReactNode } from "react";

export function PageHeader({
  path,
  title,
  description,
  actions,
}: {
  path?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        {path ? <p className="path">{path}</p> : null}
        <h1>{title}</h1>
        {description ? <div className="page-title__description">{description}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
