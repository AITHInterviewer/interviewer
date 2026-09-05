"use client";

import { useParams } from "next/navigation";

import { InterviewFlow } from "@/components/interview/InterviewFlow";
import { routeParam } from "@/lib/candidate-flow";

export default function LivePage() {
  const token = routeParam(useParams<{ token: string }>().token);
  if (!token) return null;
  return <InterviewFlow token={token} />;
}
