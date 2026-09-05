"use client";

import { useParams } from "next/navigation";

import { ProtectedRolePage } from "@/components/auth/protected-role-page";
import { VacancyWorkspace } from "@/components/vacancies/vacancy-workspace";

export default function SharedVacancyPage() {
  const params = useParams<{ vacancyId: string }>();

  return (
    <ProtectedRolePage>
      <VacancyWorkspace vacancyId={String(params.vacancyId)} />
    </ProtectedRolePage>
  );
}
