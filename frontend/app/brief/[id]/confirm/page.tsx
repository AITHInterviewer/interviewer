"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { BrandMark } from "@/components/chrome/AppShell";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { requirements } from "@/lib/demo/rubric";

export default function BriefConfirmPage() {
  const params = useParams<{ id: string }>();
  const mandatory = requirements.filter((item) => item.mandatory);
  const optional = requirements.filter((item) => !item.mandatory);

  return (
    <main className="manager-brief">
      <header>
        <BrandMark />
        <span>
          Подтверждение профиля · <PilotBadge />
        </span>
      </header>
      <section>
        <h1>Вот что мы поняли. Поправьте, если не так</h1>
        <div className="report-grid" style={{ marginTop: 24, gridTemplateColumns: "1fr 1fr" }}>
          <div className="form-surface">
            <h2>Обязательное</h2>
            {mandatory.map((item) => (
              <div key={item.id} style={{ padding: "8px 0" }}>
                ■ {item.title}
              </div>
            ))}
          </div>
          <div className="form-surface">
            <h2>Желательное</h2>
            {optional.map((item) => (
              <div key={item.id} style={{ padding: "8px 0" }}>
                □ {item.title}
              </div>
            ))}
          </div>
        </div>
        <div className="brief-actions" style={{ marginTop: 24 }}>
          <Button asChild>
            <Link href={`/vacancies/${params.id}/rubric`}>Подтвердить и передать эксперту</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
