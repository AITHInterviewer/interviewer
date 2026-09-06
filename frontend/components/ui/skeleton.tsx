/** Скелетон эталона: та же сетка, что и контент, а не спиннер по центру. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 4,
}: {
  width?: string | number;
  height?: number;
  radius?: number;
}) {
  return (
    <span
      className="np-skeleton"
      aria-hidden
      style={{ width, height, borderRadius: radius }}
    />
  );
}

/** Скелетон карточки кандидата: аватар, имя, строка стадии. */
export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden>
      <span className="skeleton-card__top">
        <Skeleton width={26} height={26} radius={999} />
        <Skeleton width="45%" height={16} />
      </span>
      <Skeleton width="70%" />
    </div>
  );
}

/** Скелетон строки таблицы. */
export function SkeletonRow({ columns = 4 }: { columns?: number }) {
  return (
    <div className="skeleton-row" aria-hidden>
      {Array.from({ length: columns }).map((_, index) => (
        <Skeleton key={index} width={index === 0 ? "70%" : "45%"} height={16} />
      ))}
    </div>
  );
}

/** Экран загрузки списка: N скелетонов той же сетки. */
export function SkeletonList({ count = 3, label }: { count?: number; label?: string }) {
  return (
    <div className="skeleton-list" role="status" aria-live="polite">
      <span className="visually-hidden">{label ?? "Загружаю"}</span>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

/** Скелетон таблицы: шапка и несколько строк той же сетки. */
export function SkeletonTable({ rows = 4, columns = 4, label }: { rows?: number; columns?: number; label?: string }) {
  return (
    <div className="skeleton-table" role="status" aria-live="polite">
      <span className="visually-hidden">{label ?? "Загружаю"}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonRow key={index} columns={columns} />
      ))}
    </div>
  );
}

/** Скелетон текстового блока: заголовок и пара строк. */
export function SkeletonText({ lines = 3, label }: { lines?: number; label?: string }) {
  return (
    <div className="skeleton-text" role="status" aria-live="polite">
      <span className="visually-hidden">{label ?? "Загружаю"}</span>
      <Skeleton width="40%" height={20} />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}
