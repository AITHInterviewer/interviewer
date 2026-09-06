"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { CandidateGate } from "@/components/chrome/CandidateGate";
import { Button } from "@/components/ui/button";
import { routeParam } from "@/lib/candidate-flow";

export default function TranscriptPage() {
  const token = routeParam(useParams<{ token: string }>().token);

  return (
    <CandidateGate token={token} current="Интервью">
      {(_info, accessToken) => (
        <section className="setup-stage setup-stage--full">
          <p className="path">Расшифровка</p>
          <h1>Текст разговора</h1>
          <p>Расшифровка появится здесь, когда будет готова.</p>
          <div className="form-actions">
            <Button asChild variant="secondary">
              <Link href={`/i/${accessToken}/done`}>Назад</Link>
            </Button>
          </div>
        </section>
      )}
    </CandidateGate>
  );
}
