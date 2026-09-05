import { InterviewClient } from "./interview-client";

type InterviewPageProps = {
  params: Promise<{ token: string }>;
};

export default async function InterviewPage({ params }: InterviewPageProps) {
  const { token } = await params;
  return <InterviewClient token={token} />;
}
