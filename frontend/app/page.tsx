import Link from "next/link";

import { Button } from "@/components/ui/button";

async function getBackendHealth() {
  const internalUrl = process.env.BACKEND_INTERNAL_URL;

  if (!internalUrl) {
    return { ok: false, detail: "BACKEND_INTERNAL_URL is not configured." };
  }

  try {
    const response = await fetch(`${internalUrl}/health`, { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, detail: `Backend responded with ${response.status}.` };
    }

    const payload = (await response.json()) as { status?: string };
    if (payload.status !== "ok") {
      return { ok: false, detail: "Backend health payload is unexpected." };
    }

    return { ok: true, detail: "Backend health check passed." };
  } catch {
    return { ok: false, detail: "Frontend could not reach backend from the configured internal URL." };
  }
}

export default async function HomePage() {
  const publicBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "not configured";
  const internalBackendUrl = process.env.BACKEND_INTERNAL_URL ?? "not configured";
  const backendHealth = await getBackendHealth();

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

      <section className="grid gap-4 rounded-2xl border bg-card p-6 text-card-foreground md:grid-cols-3">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Frontend URL</p>
          <p className="text-sm">http://localhost:3000</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Public backend URL</p>
          <p className="text-sm break-all">{publicBackendUrl}</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Internal backend URL</p>
          <p className="text-sm break-all">{internalBackendUrl}</p>
        </div>
      </section>

      <section className="rounded-2xl border p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Backend health</p>
            <p className="text-lg font-medium">{backendHealth.ok ? "Connected" : "Needs attention"}</p>
          </div>
          <div
            className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
              backendHealth.ok
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-amber-500/10 text-amber-700"
            }`}
          >
            {backendHealth.ok ? "status: ok" : "status: unavailable"}
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{backendHealth.detail}</p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/interview/demo">Открыть страницу интервью</Link>
        </Button>
      </div>
    </main>
  );
}
