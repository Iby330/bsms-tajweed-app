import { describe, expect, it } from "vitest";
import { timetableFor } from "@/lib/attendance/calendar";
import { planFromLessons, type LessonRow } from "./plan";

const OPEN = "2026-01-01T00:00:00Z";
const SHUT = "2030-01-01T00:00:00Z";
const NOW = new Date("2026-10-06T12:00:00Z");
const tt = timetableFor("brothers");

/** `n` lessons of one series in one term, week 1..n. */
function series(
  key: string,
  termId: number,
  n: number,
  { video = true, unlock = OPEN }: { video?: boolean; unlock?: string } = {},
): LessonRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${key}-${termId}-${i + 1}`,
    title: `${key} lesson ${i + 1}`,
    series: key,
    position: 1,
    youtube_id: video ? `vid${i + 1}` : null,
    weeks: { term_id: termId, number: i + 1, unlock_at: unlock },
  }));
}

const ROWS: LessonRow[] = [
  ...series("tajweed", 1, 8), // ghunna
  ...series("tajweed", 2, 7), // sifaat (old)
  ...series("tajweed", 3, 6, { video: false, unlock: SHUT }), // mudood — no videos
  ...series("tfp", 3, 7, { video: false, unlock: SHUT }), // mabadi — no videos
  ...series("umm_al_kitab", 1, 9), // ummul kitab
];

describe("planFromLessons", () => {
  it("is empty for a class with no syllabus", () => {
    expect(planFromLessons(ROWS, "Hareer", tt, NOW)).toEqual({});
    expect(planFromLessons(ROWS, null, tt, NOW)).toEqual({});
  });

  it("lays one lesson of each course on each Monday", () => {
    // Group 3 takes ghunna and ummul kitab together in Term 1.
    const week1 = planFromLessons(ROWS, "Demo — Abdallah", tt, NOW)[1][0];
    expect(week1.number).toBe(1);
    expect(week1.date).toBe("2026-10-05");
    expect(week1.lessons.map((l) => `${l.courseLabel} ${l.index}`)).toEqual([
      "Ghunna 1",
      "Umm al-Kitāb 1",
    ]);
    // And each is labelled by the rule it teaches, not by its slot.
    expect(week1.lessons.map((l) => l.label)).toEqual([
      "tajweed lesson 1",
      "umm_al_kitab lesson 1",
    ]);
  });

  it("walks each course forward a lesson per week", () => {
    const term1 = planFromLessons(ROWS, "Demo — Abdallah", tt, NOW)[1];
    expect(term1[3].lessons.map((l) => l.index)).toEqual([4, 4]);
    expect(term1[3].lessons[0].label).toBe("tajweed lesson 4");
  });

  it("links a lesson only when its week is open and it has a video", () => {
    const term1 = planFromLessons(ROWS, "Demo — Abdallah", tt, NOW)[1];
    expect(term1[0].lessons[0].href).toBe("/lessons/tajweed-1-1");
  });

  it("sends teachers to their own lesson route, not the students'", () => {
    // The student layout redirects any teacher landing on /lessons/<id> to
    // /teacher/home, so getting this wrong looks like the link doing nothing
    // rather than like a broken link.
    const term1 = planFromLessons(ROWS, "Demo — Abdallah", tt, NOW, "teacher")[1];
    expect(term1[0].lessons[0].href).toBe("/teacher/lessons/tajweed-1-1");
  });

  it("does not make a teacher wait for a week to unlock", () => {
    // /teacher/lessons locks nothing — preparing an unopened week is the job.
    // Mudood's weeks are shut, and a teacher still gets the link.
    const withVideos = [
      ...series("tajweed", 3, 6, { unlock: SHUT }),
      ...series("tajweed", 1, 8),
    ];
    const week1 = planFromLessons(withVideos, "Masjid An-Nabawi", tt, NOW, "teacher")[1][0];
    expect(week1.lessons[1].href).toBe("/teacher/lessons/tajweed-3-1");

    // The same row, for a student, still waits.
    const forStudent = planFromLessons(withVideos, "Masjid An-Nabawi", tt, NOW)[1][0];
    expect(forStudent.lessons[1].href).toBeNull();
  });

  it("withholds the title and the link while the week is shut", () => {
    // Group 1 studies mudood in Term 1, but the lessons live in Term 3's
    // weeks and do not open until then. The topic is still named.
    const week1 = planFromLessons(ROWS, "Masjid An-Nabawi", tt, NOW)[1][0];
    const mudood = week1.lessons[1];
    expect(mudood.courseLabel).toBe("Mudūd");
    expect(mudood.index).toBe(1);
    // The rule is still named — only the link waits for the week to open.
    expect(mudood.label).toBe("tajweed lesson 1");
    expect(mudood.href).toBeNull();
    expect(mudood.missing).toBe(false);
  });

  it("offers no link for an open lesson that has no video yet", () => {
    const openNoVideo = [...series("tajweed", 1, 8, { video: false })];
    const week1 = planFromLessons(openNoVideo, "Demo — Abdallah", tt, NOW)[1][0];
    expect(week1.lessons[0].label).toBe("tajweed lesson 1");
    expect(week1.lessons[0].href).toBeNull();
  });

  it("marks a course the app holds nothing for as missing, but still names it", () => {
    // Group 1's Term 2 is sifaat (new), which does not exist.
    const term2 = planFromLessons(ROWS, "Masjid An-Nabawi", tt, NOW)[2];
    expect(term2[0].lessons[0]).toMatchObject({
      courseLabel: "Ṣifāt (new)",
      index: 1,
      missing: true,
      href: null,
    });
  });

  it("runs out quietly when a course has fewer lessons than the term has Mondays", () => {
    // Mudood is 6 lessons; Term 1 has 8 Mondays.
    const term1 = planFromLessons(ROWS, "Masjid An-Nabawi", tt, NOW)[1];
    expect(term1).toHaveLength(8);
    expect(term1[5].lessons[1].missing).toBe(false);
    expect(term1[6].lessons[1].missing).toBe(true);
  });

  it("drops the tail when a course has more lessons than the term has Mondays", () => {
    // Umm al-Kitab is 9 lessons into 8 Mondays — lesson 9 has nowhere to go.
    const term1 = planFromLessons(ROWS, "Demo — Abdallah", tt, NOW)[1];
    const indices = term1.map((w) => w.lessons[1].index);
    expect(indices).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(indices).not.toContain(9);
  });

  it("skips a term the class has no plan for", () => {
    // Group 5's Term 3 is TBC.
    expect(planFromLessons(ROWS, "Masjid Al-Aqsa", tt, NOW)[3]).toBeUndefined();
  });

  it("plans only tajweed Mondays, never the hifdh day", () => {
    const term1 = planFromLessons(ROWS, "Demo — Abdallah", tt, NOW)[1];
    for (const week of term1)
      expect(new Date(`${week.date}T12:00:00`).getDay()).toBe(1);
  });
});
