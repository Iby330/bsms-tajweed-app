import { notFound } from "next/navigation";
import { StudentMurajaah } from "@/components/murajaah/teacher/student-murajaah";
import { murajaahTeacherData } from "../data";

export const dynamic = "force-dynamic";

/** One student's murāja'ah: a real URL, so it can be linked and reloaded. */
export default async function MurajaahStudent({ params }: { params: Promise<{ studentId: string }> }) {
  const [{ studentId }, data] = await Promise.all([params, murajaahTeacherData()]);
  // The layout has already sent anyone else away; a student not in the class is a 404.
  if (!data || !data.students.some((s) => s.id === studentId)) notFound();
  return <StudentMurajaah studentId={studentId} />;
}
