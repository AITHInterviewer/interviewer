"use client";

import type { InternalUser } from "@/lib/api";

/** Селект назначения на роль (эксперт/менеджер): список сужен до пользователей
 * с этой ролью, плюс возможность оставить вакансию без назначения. */
export function AssigneeField({
  label,
  roleCode,
  users,
  value,
  onChange,
  currentUserId,
}: {
  label: string;
  roleCode: string;
  users: InternalUser[];
  value: string | null;
  onChange: (value: string | null) => void;
  currentUserId?: string;
}) {
  const candidates = users.filter((user) => user.roles.includes(roleCode));

  return (
    <label>
      {label}
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">Не назначено</option>
        {candidates.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
            {user.id === currentUserId ? " (вы)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
