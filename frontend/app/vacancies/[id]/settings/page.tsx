import { VacancySettingsClient } from "./settings-client";

type VacancySettingsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function VacancySettingsPage({ params }: VacancySettingsPageProps) {
  const { id } = await params;
  return <VacancySettingsClient vacancyId={id} />;
}
