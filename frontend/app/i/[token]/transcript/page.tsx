"use client";

import { useParams } from "next/navigation";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { getCandidateByToken } from "@/lib/demo/candidates";

export default function TranscriptStubPage() {
  const params = useParams<{ token: string }>();
  const candidate = getCandidateByToken(params.token);
  if (!candidate) return null;

  return (
    <CandidateShell step="Готово">
      <section className="setup-stage" style={{ width: "100%" }}>
        <PilotBadge />
        <h1 style={{ marginTop: 16 }}>Транскрипт</h1>
        <p>будет после пилота</p>
      </section>
    </CandidateShell>
  );
}
