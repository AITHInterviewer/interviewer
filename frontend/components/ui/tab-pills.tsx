"use client";

export type TabItem = { label: string; count?: number; disabled?: boolean; hint?: string };

/** Вкладки-пилюли со счётчиком. Счётчик информирует, а не тревожит. */
export function TabPills({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.label}
          type="button"
          role="tab"
          aria-selected={tab.label === active}
          data-active={tab.label === active}
          disabled={tab.disabled}
          title={tab.disabled ? tab.hint : undefined}
          onClick={() => onChange(tab.label)}
        >
          {tab.label}
          {tab.count !== undefined ? ` · ${tab.count}` : ""}
        </button>
      ))}
    </div>
  );
}
