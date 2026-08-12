import { redirect } from "next/navigation";

/** The marking screen lives under /teacher/homework now; old links follow it. */
export default async function ReviewDetailMoved({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  redirect(`/teacher/homework/submission/${submissionId}`);
}
