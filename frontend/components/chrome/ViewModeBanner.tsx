"use client";

/** Режим просмотра калибровки рекрутером (?from=recruiter — не авторизация). */
export function ViewModeBanner() {
  return (
    <p className="view-mode-banner" role="status">
      Режим просмотра. Редактирование недоступно — комплект собирает и утверждает эксперт.
    </p>
  );
}
