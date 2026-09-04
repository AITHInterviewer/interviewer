import { InterviewFlow } from "@/components/interview/InterviewFlow";

type InterviewPageProps = {
  params: Promise<{ token: string }>;
};

export default async function InterviewPage({ params }: InterviewPageProps) {
  const { token } = await params;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-10">
      <InterviewFlow token={token} />
    </main>
  );
}
