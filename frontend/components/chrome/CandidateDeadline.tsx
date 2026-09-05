import { formatDeadlineDate } from "@/lib/candidate-flow";

/** Срок из ответа приглашения. Если поля нет — причина и следующий шаг. */
export function CandidateDeadline({ deadline }: { deadline?: string | null }) {
  const formatted = formatDeadlineDate(deadline);
  if (formatted) {
    return <p>Срок: {formatted}</p>;
  }
  return (
    <p>
      Дата, до которой нужно ответить, в приглашении не указана. Если срок был в письме —
      ориентируйтесь на него, иначе напишите рекрутеру.
    </p>
  );
}
