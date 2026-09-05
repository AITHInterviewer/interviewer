"use client";

import { CandidateFrame } from "@/components/chrome/CandidateGate";

export default function ExpiredPage() {
  return (
    <CandidateFrame current="Приглашение" showStepper={false}>
      <section className="setup-stage" style={{ width: "100%" }}>
        <p className="path">Ссылка</p>
        <h1>Эта ссылка больше не работает</h1>
        <p>Попросите новую ссылку у рекрутера, который прислал приглашение.</p>
      </section>
    </CandidateFrame>
  );
}
