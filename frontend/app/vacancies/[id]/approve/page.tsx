import { redirect } from "next/navigation";

/** Отдельного шага «Утверждение» больше нет: эксперт одобряет требования и тем самым
 * запускает вакансию (specs/010-vacancy-from-description). Маршрут оставлен редиректом —
 * на него ещё ведут старые ссылки из писем и закладок. */
export default async function ApproveRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/vacancies/${id}/rubric`);
}
