import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <main className="workspace workspace--form">
      <p className="path">403</p>
      <h1>Нет доступа</h1>
      <p className="page-title__description">
        У вас нет доступа к этому отчёту. Доступ выдаёт рекрутер вакансии.
      </p>
      <Button asChild variant="secondary">
        <Link href="/login">Вернуться ко входу</Link>
      </Button>
    </main>
  );
}
