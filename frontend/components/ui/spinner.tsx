export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span
      className="spinner"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size }}
    />
  );
}
