import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { HifzTabs } from "@/components/app/hifz-tabs";
import { MurajaahTeacher } from "@/components/murajaah/teacher/murajaah-teacher";
import { TargetsButton, TargetsPanel } from "@/components/murajaah/teacher/targets-panel";
import { MURAJAAH_TABS } from "../tabs";
import { murajaahTeacherData } from "./data";

/**
 * The Esteemed Ustadhs' murāja'ah, for their teacher: the roster and each
 * student's page share this layout, so the targets panel and its unsaved
 * draft carry across both. Any other teacher is sent to the hifdh register.
 */
export default async function MurajaahLayout({ children }: { children: ReactNode }) {
  const data = await murajaahTeacherData();
  if (!data) redirect("/teacher/hifdh");

  return (
    <MurajaahTeacher data={data}>
      <header className="masthead">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1><span>Hifdh register</span></h1>
          <TargetsButton className="mt-2" />
        </div>
        <p>
          {data.className} · Murāja&apos;ah. Each attempt&apos;s time is banded per hizb against your targets; select a
          student for their chart and history.
        </p>
      </header>

      <HifzTabs basePath="/teacher/hifdh" active="murajaah" tabs={MURAJAAH_TABS} />

      <div className="mt-6">{children}</div>
      <TargetsPanel />
    </MurajaahTeacher>
  );
}
