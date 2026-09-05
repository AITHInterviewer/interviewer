import { InterviewFlow } from "@/components/interview/InterviewFlow";

type InterviewPageProps = {
  params: Promise<{ token: string }>;
};

export default async function InterviewPage({ params }: InterviewPageProps) {
  const { token } = await params;

  return <InterviewFlow token={token} />;
}
