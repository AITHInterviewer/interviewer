"use client";

import { ProtectedRolePage } from "@/components/auth/protected-role-page";

export default function ExpertPage() {
  return <ProtectedRolePage expectedRole="expert" />;
}
