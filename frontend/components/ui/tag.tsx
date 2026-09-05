/** Тег стека роли. Это не «скор» и не статус. */
export function Tag({ label }: { label: string }) {
  return <span className="tag">{label}</span>;
}

/** Моно-метка версии: рубрика, комплект, модель. */
export function VersionChip({ label }: { label: string }) {
  return <span className="version-chip">{label}</span>;
}
