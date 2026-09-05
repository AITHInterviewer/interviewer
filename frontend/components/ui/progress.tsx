/** Стадия пайплайна словами и полоской. Это не процент соответствия. */
export function Progress({ value, max, label }: { value: number; max: number; label?: string }) {
  const percent = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <span className="progress">
      {label ? <span className="progress__label">{label}</span> : null}
      <span
        className="progress__track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <span className="progress__fill" style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}
