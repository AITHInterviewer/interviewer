"use client";

import Link from "next/link";

import { BrandMark } from "@/components/chrome/AppShell";
import { Button } from "@/components/ui/button";

const entries = [
  { href: "/vacancies", label: "Войти как рекрутер" },
  { href: "/vacancies/python-middle/rubric", label: "Войти как эксперт" },
  { href: "/manager/lida", label: "Войти как менеджер" },
  { href: "/i/dmitry", label: "Войти как кандидат №1" },
  { href: "/i/nikita", label: "Войти как кандидат №2" },
  { href: "/i/lida", label: "Войти как кандидат №3" },
];

export default function LoginPage() {
  return (
    <main className="workspace workspace--form">
      <div className="page-title">
        <div>
          <BrandMark />
          <p className="path" style={{ marginTop: 18 }}>
            демо-вход
          </p>
          <h1>Вход</h1>
          <p className="page-title__description">
            Настоящая почта не нужна. Выберите роль, чтобы пройти демо-путь жюри.
          </p>
        </div>
      </div>
      <div className="login-grid">
        {entries.map((item) => (
          <Button key={item.href} asChild variant="secondary" size="large">
            <Link href={item.href}>{item.label}</Link>
          </Button>
        ))}
      </div>
      <p style={{ marginTop: 24, color: "var(--ink-tertiary)", fontSize: 12 }}>
        Пометка: демо. Письма наружу не уходят.
      </p>
    </main>
  );
}
