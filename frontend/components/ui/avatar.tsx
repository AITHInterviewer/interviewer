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

export type AvatarPerson = { name: string; role: string };

/** Стопка аватаров внахлёст — быстрый визуальный «кто на вакансии»: наведение
 * подсказкой показывает роль и имя. Только показ, назначение — своими полями рядом. */
export function AvatarGroup({ people }: { people: AvatarPerson[] }) {
  if (people.length === 0) {
    return null;
  }
  return (
    <span className="avatar-group" role="list" aria-label="Назначенные на вакансию">
      {people.map((person, index) => (
        <span
          className="avatar-group__item"
          role="listitem"
          key={`${person.role}-${index}`}
          title={`${person.role}: ${person.name}`}
        >
          <Avatar name={person.name} />
        </span>
      ))}
    </span>
  );
}
