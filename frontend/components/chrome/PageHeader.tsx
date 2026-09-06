import Link from "next/link";
import type { ReactNode } from "react";

export type Breadcrumb = { label: string; href?: string };

export function PageHeader({
  path,
  breadcrumbs,
  title,
  description,
  actions,
}: {
  /** Плоская строка крошек без ссылок — для простых экранов. */
  path?: string;
  /** Крошки со ссылками: последний пункт — текущая страница. */
  breadcrumbs?: Breadcrumb[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const items: Breadcrumb[] = breadcrumbs ?? (path ? [{ label: path }] : []);

  return (
    <header className="page-title">
      <div>
        {items.length > 0 ? (
          <nav className="path path--breadcrumbs" aria-label="Хлебные крошки">
            {items.map((item, index) => (
              <span className="path__segment" key={`${item.label}-${index}`}>
                {index > 0 ? <span className="path__sep" aria-hidden="true"> / </span> : null}
                {item.href ? (
                  <Link href={item.href}>{item.label}</Link>
                ) : (
                  <span>{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1>{title}</h1>
        {description ? <div className="page-title__description">{description}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
