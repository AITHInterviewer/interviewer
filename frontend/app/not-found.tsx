import Link from "next/link";

import { BrandMark } from "@/components/chrome/AppShell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="auth-shell">
      <div className="auth-shell__panel">
        <BrandMark />
        <p className="path">Страница не найдена</p>
        <h1>Такой страницы нет</h1>
        <p className="page-title__description">
          Проверьте адрес или вернитесь ко входу в кабинет.
        </p>
        <div className="form-actions">
          <Button asChild variant="secondary">
            <Link href="/login">Вернуться ко входу</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
