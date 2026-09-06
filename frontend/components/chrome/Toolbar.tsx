"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/** Тулбар списка: фильтры слева, главное действие справа. */
export function Toolbar({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="toolbar">
      {children}
      {action ? <div className="toolbar__spacer">{action}</div> : null}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <span className={className ? `search-field ${className}` : "search-field"}>
      <MagnifyingGlass size={16} />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  label: string;
}) {
  return (
    <select
      className="select-field"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
