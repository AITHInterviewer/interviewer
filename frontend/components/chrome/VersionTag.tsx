export function VersionTag({
  rubric = "v2",
  questions = "v2",
  model = "2026-08",
  demoNote = false,
}: {
  rubric?: string;
  questions?: string;
  model?: string;
  demoNote?: boolean;
}) {
  return (
    <span className="version-tag">
      {demoNote ? "в демо это имитация версий · " : ""}
      рубрика {rubric} · комплект {questions} · модель {model}
    </span>
  );
}

export function PilotBadge() {
  return <span className="pilot-badge">Пилот</span>;
}
