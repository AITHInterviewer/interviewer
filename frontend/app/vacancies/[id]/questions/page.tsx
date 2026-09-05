import { VacancyQuestionsClient } from "./questions-client";

type VacancyQuestionsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function VacancyQuestionsPage({ params }: VacancyQuestionsPageProps) {
  const { id } = await params;
  return <VacancyQuestionsClient vacancyId={id} />;
}
