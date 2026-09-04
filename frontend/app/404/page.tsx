import Link from "next/link";

import { PageHeader } from "@/components/chrome/PageHeader";
import { Button } from "@/components/ui/button";

export default function ExplicitNotFoundPage() {
  return (
    <main className="workspace workspace--form">
      <PageHeader
        path="404"
        title="Страницы нет"
        description="Такой страницы в продукте нет. Проверьте адрес или вернитесь ко входу."
      />
      <Button asChild variant="secondary">
        <Link href="/login">Вернуться ко входу</Link>
      </Button>
    </main>
  );
}
