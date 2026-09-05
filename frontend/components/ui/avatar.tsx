/** Инициалы вместо фото: в демо фотографий нет, а имя должно читаться. */
export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ name, accent }: { name: string; accent?: boolean }) {
  return (
    <span className="avatar" data-accent={accent || undefined} aria-hidden>
      {initialsOf(name)}
    </span>
  );
}
