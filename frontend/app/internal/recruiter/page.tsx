"use client";

import { RecruiterWorkspace } from "@/components/auth/recruiter-workspace";
import { ProtectedRolePage } from "@/components/auth/protected-role-page";

export default function RecruiterInternalPage() {
  return (
    <ProtectedRolePage requiredArea="area.recruiter_workspace">
      <RecruiterWorkspace />
    </ProtectedRolePage>
  );
}
