"use client";

import Link from "next/link";

import { CandidateFrame } from "@/components/chrome/CandidateGate";
import { Button } from "@/components/ui/button";

export default function ExpiredPage() {
  return (
    <CandidateFrame current="Приглашение">
      <section className="setup-stage" style={{ width: "100%" }}>
        <p className="path">Ссылка</p>
        <h1>Эта ссылка больше не работает</h1>
        <p>
          Приглашение истекло, удалено или скопировано не полностью. Попросите у рекрутера новую
          ссылку.
        </p>
        <div className="form-actions">
          <Button asChild variant="secondary">
            <Link href="/login">К выбору роли</Link>
          </Button>
        </div>
      </section>
    </CandidateFrame>
  );
}
