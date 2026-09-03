export function VersionTag({
  rubric = "v2",
  questions = "v2",
  model = "2026-08",
}: {
  rubric?: string;
  questions?: string;
  model?: string;
}) {
  return (
    <span className="version-tag">
      рубрика {rubric} · комплект {questions} · модель {model}
    </span>
  );
}

export function PilotBadge() {
  return <span className="pilot-badge">Пилот</span>;
}
