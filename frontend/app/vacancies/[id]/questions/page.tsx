import { Suspense } from "react";

import { ScreenState } from "@/components/chrome/ScreenState";

import { VacancyQuestionsClient } from "./questions-client";

type VacancyQuestionsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function VacancyQuestionsPage({ params }: VacancyQuestionsPageProps) {
  const { id } = await params;
  return (
    <Suspense fallback={<ScreenState kind="loading" title="Loading" text="Loading questions..." />}>
      <VacancyQuestionsClient vacancyId={id} />
    </Suspense>
  );
}
