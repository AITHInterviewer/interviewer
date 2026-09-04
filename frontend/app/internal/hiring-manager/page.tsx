"use client";

import { ProtectedRolePage } from "@/components/auth/protected-role-page";

export default function HiringManagerPage() {
  return <ProtectedRolePage expectedRole="hiring_manager" />;
}
