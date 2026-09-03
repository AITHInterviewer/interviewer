import { Button } from "@/components/ui/button";

type InterviewPageProps = {
  params: Promise<{ token: string }>;
};

export default async function InterviewPage({ params }: InterviewPageProps) {
  const { token } = await params;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <section className="space-y-3">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Candidate Interview</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Пустой экран интервью</h1>
        <p className="max-w-2xl text-muted-foreground">
          Страница зарезервирована под работу с `getUserMedia`, `MediaRecorder` и `speechSynthesis`.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground">
          Тайлы камеры и агента появятся здесь
        </div>
        <div className="space-y-4 rounded-xl border bg-card p-6 text-card-foreground">
          <div className="space-y-2">
            <h2 className="text-lg font-medium">Черновой статус</h2>
            <p className="text-sm text-muted-foreground">Интервью ещё не подключено к backend или live-agent.</p>
          </div>
          <p className="text-sm text-muted-foreground">Токен ссылки: {token}</p>
          <div className="flex gap-3">
            <Button type="button" variant="outline" disabled>
              Включить камеру
            </Button>
            <Button type="button" disabled>
              Начать запись
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
