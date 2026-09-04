"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { BrandMark } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { requirements } from "@/lib/demo/rubric";
import { clearDemoRole } from "@/lib/demo/session";

export default function BriefConfirmPage() {
  const params = useParams<{ id: string }>();
  const mandatory = requirements.filter((item) => item.mandatory);
  const optional = requirements.filter((item) => !item.mandatory);

  return (
    <main className="manager-brief">
      <header>
        <BrandMark />
        <Link className="candidate-help__role" href="/login" onClick={() => clearDemoRole()}>
          К выбору роли
        </Link>
        <span>
          Подтверждение профиля · <PilotBadge />
        </span>
      </header>
      <section>
        <PageHeader
          path="Бриф / подтверждение"
          title="Вот что мы поняли. Поправьте, если не так"
          description={<PilotBadge />}
        />
        <div className="report-grid">
          <div className="form-surface">
            <h2>Обязательное</h2>
            {mandatory.map((item) => (
              <div key={item.id}>
                ■ {item.title}
              </div>
            ))}
          </div>
          <div className="form-surface">
            <h2>Желательное</h2>
            {optional.map((item) => (
              <div key={item.id}>
                □ {item.title}
              </div>
            ))}
          </div>
        </div>
        <div className="brief-actions">
          <Button asChild variant="secondary">
            <Link href={`/brief/${params.id}`}>Назад</Link>
          </Button>
          <Button asChild>
            <Link href={`/vacancies/${params.id}/rubric`}>Подтвердить и передать эксперту</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
