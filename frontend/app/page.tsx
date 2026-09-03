import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">AInterviewer</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Новый frontend-каркас на Next.js, Tailwind и shadcn/ui.
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
          Приложение обнулено. Здесь пока только базовая структура для recruiter и candidate flows.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/interview/demo">Открыть страницу интервью</Link>
        </Button>
      </div>
    </main>
  );
}
