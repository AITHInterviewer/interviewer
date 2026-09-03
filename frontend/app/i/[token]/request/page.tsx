"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { CandidateShell } from "@/components/chrome/CandidateShell";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { getCandidateByToken } from "@/lib/demo/candidates";
import { vacancy } from "@/lib/demo/vacancies";

export default function RequestPage() {
  const params = useParams<{ token: string }>();
  const candidate = getCandidateByToken(params.token);
  const [sent, setSent] = useState(false);
  const [kind, setKind] = useState<"delete" | "review">("review");

  if (!candidate) return null;

  return (
    <CandidateShell step="Готово">
      <PilotBadge />
      <section className="setup-stage" style={{ width: "100%", marginTop: 16 }}>
        <h1>Запрос</h1>
        {sent ? (
          <p>
            Запрос передан {vacancy.recruiterName}. Срок ответа - 7 дней.
          </p>
        ) : (
          <>
            <div className="density-switch" style={{ width: "fit-content" }}>
              <button type="button" data-active={kind === "delete"} onClick={() => setKind("delete")}>
                Удалить мои данные
              </button>
              <button type="button" data-active={kind === "review"} onClick={() => setKind("review")}>
                Пересмотреть результат
              </button>
            </div>
            <label style={{ display: "grid", gap: 8, marginTop: 18 }}>
              Комментарий
              <textarea placeholder="Кратко опишите запрос" />
            </label>
            <div className="form-actions">
              <Button type="button" onClick={() => setSent(true)}>
                Отправить
              </Button>
            </div>
          </>
        )}
      </section>
    </CandidateShell>
  );
}
