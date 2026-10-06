import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/app/coming-soon";

const STUBS: Record<string, { title: string; description: string }> = {
  resources: {
    title: "Resource Library",
    description:
      "Extra videos, notes and reference material for students and teachers, all in one place.",
  },
  // The slug stays `seerah`, the series' key, so existing links keep working.
  seerah: {
    title: "Sahabah Stories",
    description: "Stories of the Companions of the Prophet ﷺ.",
  },
  notifications: {
    title: "Notifications",
    description:
      "Email reminders when the week's videos drop and before homework deadlines.",
  },
  curriculum: {
    title: "Manage Curriculum",
    description:
      "Add videos, edit homework questions and adjust the weekly schedule.",
  },
};

export default async function ComingSoonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const stub = STUBS[slug];
  if (!stub) notFound();
  return <ComingSoon title={stub.title} description={stub.description} />;
}

export function generateStaticParams() {
  return Object.keys(STUBS).map((slug) => ({ slug }));
}
