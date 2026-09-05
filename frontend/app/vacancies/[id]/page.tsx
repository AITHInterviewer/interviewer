import { VacancyDetailClient } from "./vacancy-detail-client";

type VacancyDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function VacancyDetailPage({ params }: VacancyDetailPageProps) {
  const { id } = await params;
  return <VacancyDetailClient vacancyId={id} />;
}
