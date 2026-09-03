import { redirect } from "next/navigation";

type Props = { params: Promise<{ token: string }> };

export default async function LegacyInterviewRedirect({ params }: Props) {
  const { token } = await params;
  redirect(`/i/${token}`);
}
