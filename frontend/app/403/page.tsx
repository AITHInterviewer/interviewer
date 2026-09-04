import Link from "next/link";

import { PageHeader } from "@/components/chrome/PageHeader";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <main className="workspace workspace--form">
      <PageHeader
        path="403"
        title="Нет доступа"
        description="У вас нет доступа к этому отчёту. Доступ выдаёт рекрутер вакансии."
      />
      <Button asChild variant="secondary">
        <Link href="/login">Вернуться ко входу</Link>
      </Button>
    </main>
  );
}
