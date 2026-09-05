"use client";

import { ExpertWorkspace } from "@/components/auth/expert-workspace";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";

export default function ExpertPage() {
  return (
    <ProtectedRolePage requiredArea="area.expert_questions">
      <ExpertWorkspace />
    </ProtectedRolePage>
  );
}
