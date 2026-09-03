import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function ExplicitNotFoundPage() {
  return (
    <main className="workspace workspace--form">
      <p className="path">404</p>
      <h1>Страницы нет</h1>
      <p className="page-title__description">Такой страницы в продукте нет. Проверьте адрес или вернитесь ко входу.</p>
      <Button asChild variant="secondary">
        <Link href="/login">Вернуться ко входу</Link>
      </Button>
    </main>
  );
}
