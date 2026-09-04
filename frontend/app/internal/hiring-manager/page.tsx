"use client";

import { ProtectedRolePage } from "@/components/auth/protected-role-page";

export default function HiringManagerPage() {
  return (
    <ProtectedRolePage requiredArea="area.hiring_manager_review">
      <p>Hiring manager workspace is reserved for vacancy review workflows.</p>
    </ProtectedRolePage>
  );
}
