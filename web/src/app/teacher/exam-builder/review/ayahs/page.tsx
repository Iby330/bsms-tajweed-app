import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Crumbs } from "@/components/app/crumbs";
import { AyahCompare } from "@/components/exam-builder/ayah-compare";
import { AYAH_PROPOSALS } from "@/lib/exam-builder/ayah-proposals";
import { ayahEntries } from "@/lib/exam-builder/ayah-review";
import { loadBankForReview } from "@/lib/exam-builder/queries";
import { currentProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Typeset words against the pictures" };
export const dynamic = "force-dynamic";

/**
 * Admin only (anyone else gets a 404, as on the review page): every bank
 * question whose Qur'an picture has typeset words, picture beside words, so
 * the owner can check each swap and keep a picture where it is better.
 */
export default async function AyahReviewPage() {
  if (!(await currentProfile())?.is_admin) notFound();
  const { questions } = await loadBankForReview();
  const entries = ayahEntries(questions, AYAH_PROPOSALS);

  return (
    <>
      <header className="masthead">
        <Crumbs items={[
          { label: "Exam Builder", href: "/teacher/exam-builder" },
          { label: "Review the bank", href: "/teacher/exam-builder/review" },
          { label: "Pictures and typeset words" },
        ]} />
        <h1><span>Pictures and</span> <b>typeset words</b></h1>
        <p>
          Each question here had its Qur&apos;an as a picture. The same words are now set from the app&apos;s own mushaf,
          the way the mushaf reader sets them. Check each one against its picture. &ldquo;Keep the picture&rdquo; puts the
          picture back for that part of the question; &ldquo;Use the typeset words&rdquo; undoes it. The pictures are never
          deleted. Papers teachers have already built hold their own copies, so nothing here changes them.
        </p>
        <p className="text-sm">
          <Link href="/teacher/exam-builder/review" className="text-brand underline-offset-4 hover:underline">Back to the review</Link>
        </p>
      </header>
      <AyahCompare initial={entries} />
    </>
  );
}
