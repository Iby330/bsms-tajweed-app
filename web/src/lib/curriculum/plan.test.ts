import { describe, expect, it } from "vitest";
import { timetableFor } from "@/lib/attendance/calendar";
import { itemsInWeek, lessonsOnSection, planFromLessons, type LessonRow } from "./plan";
import type { ClassSchedule } from "./tree";

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
    expect(planFromLessons(ROWS, "Demo: Brothers", tt, NOW)).toEqual({});
    expect(planFromLessons(ROWS, null, tt, NOW)).toEqual({});
  });

  it("lays one lesson of each course on each Monday", () => {
    // Group 3 takes ghunna and ummul kitab together in Term 1.
    const week1 = planFromLessons(ROWS, "Masjid Al-Umawi", tt, NOW)[1][0];
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
    const term1 = planFromLessons(ROWS, "Masjid Al-Umawi", tt, NOW)[1];
    expect(term1[3].lessons.map((l) => l.index)).toEqual([4, 4]);
    expect(term1[3].lessons[0].label).toBe("tajweed lesson 4");
  });

  it("links a lesson only when its week is open and it has a video", () => {
    const term1 = planFromLessons(ROWS, "Masjid Al-Umawi", tt, NOW)[1];
    expect(term1[0].lessons[0].href).toBe("/lessons/tajweed-1-1");
  });

  it("sends teachers to their own lesson route, not the students'", () => {
    // The student layout redirects any teacher landing on /lessons/<id> to
    // /teacher/home, so getting this wrong looks like the link doing nothing
    // rather than like a broken link.
    const term1 = planFromLessons(ROWS, "Masjid Al-Umawi", tt, NOW, "teacher")[1];
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
    const week1 = planFromLessons(openNoVideo, "Masjid Al-Umawi", tt, NOW)[1][0];
    expect(week1.lessons[0].label).toBe("tajweed lesson 1");
    expect(week1.lessons[0].href).toBeNull();
  });

  it("marks a course the app holds nothing for as missing, but still names it", () => {
    // Group 1's Term 2 is sifaat (new), which does not exist.
    const term2 = planFromLessons(ROWS, "Masjid An-Nabawi", tt, NOW)[2];
    expect(term2[0].lessons[0]).toMatchObject({
      courseLabel: "Ṣifāt series",
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
    const term1 = planFromLessons(ROWS, "Masjid Al-Umawi", tt, NOW)[1];
    const indices = term1.map((w) => w.lessons[1].index);
    expect(indices).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(indices).not.toContain(9);
  });

  it("skips a term the class has no plan for", () => {
    // Group 5's Term 3 is TBC.
    expect(planFromLessons(ROWS, "Masjid Al-Aqsa", tt, NOW)[3]).toBeUndefined();
  });

  it("plans only tajweed Mondays, never the hifdh day", () => {
    const term1 = planFromLessons(ROWS, "Masjid Al-Umawi", tt, NOW)[1];
    for (const week of term1)
      expect(new Date(`${week.date}T12:00:00`).getDay()).toBe(1);
  });
});

describe("itemsInWeek", () => {
  it("is item k = week k with nothing listed, even past the course's end", () => {
    expect(itemsInWeek(undefined, 8, 3)).toEqual([3]);
    expect(itemsInWeek({}, 6, 7)).toEqual([7]);
  });

  it("puts several listed items in one week, and none in a week they left", () => {
    const listed = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 2 };
    expect(itemsInWeek(listed, 8, 1)).toEqual([1, 2]);
    expect(itemsInWeek(listed, 8, 2)).toEqual([3, 4, 5, 6]);
    expect(itemsInWeek(listed, 8, 3)).toEqual([]);
    // an unlisted item that exists keeps its own week
    expect(itemsInWeek(listed, 8, 7)).toEqual([7]);
    // …and one past the course's end is not invented
    expect(itemsInWeek(listed, 8, 9)).toEqual([]);
  });
});

describe("planFromLessons under a class's own item weeks", () => {
  /** Group 1's shape: week 1 = Ghunna 1, 2 and Ṣifāt 1; week 2 = Ghunna 3–6;
   *  Ṣifāt 2 and 3 come back in week 4; Mudūd keeps item k = week k. */
  const weeks = [
    { number: 1, unlock_at: "2026-10-02T19:00:00Z", due_at: "2026-10-05T16:00:00Z" },
    { number: 2, unlock_at: "2026-10-08T12:00:00Z", due_at: "2026-10-11T17:00:00Z" },
    { number: 3, unlock_at: "2026-10-15T12:00:00Z", due_at: "2026-10-18T17:00:00Z" },
    { number: 4, unlock_at: "2026-10-22T12:00:00Z", due_at: "2026-10-25T17:00:00Z" },
  ];
  const groupOne: ClassSchedule = {
    courses: [
      { courseId: "GH", key: "ghunna", label: "Ghunna", termId: 1, position: 1 },
      { courseId: "MU", key: "mudood", label: "Mudūd", termId: 1, position: 2 },
      { courseId: "SO", key: "sifaat_old", label: "Ṣifāt", termId: 1, position: 3 },
    ],
    firstUnlockByTerm: { 1: weeks[0].unlock_at },
    weeksByTerm: { 1: weeks },
    itemWeeks: {
      GH: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 2 },
      SO: { 1: 1, 2: 4, 3: 4, 4: 5 },
    },
  };
  const rows = [
    ...series("tajweed", 1, 8),
    ...series("tajweed", 2, 7),
    ...series("tajweed", 3, 6, { unlock: SHUT }), // mudood: filed in Term 3
  ];
  const term1 = planFromLessons(rows, "Masjid An-Nabawi", tt, NOW, "student", groupOne)[1];
  const slots = (i: number) => term1[i].lessons.map((l) => `${l.courseLabel} ${l.index}`);

  it("puts several items of one course on one Monday", () => {
    expect(slots(0)).toEqual(["Ghunna 1", "Ghunna 2", "Mudūd 1", "Ṣifāt 1"]);
    expect(slots(1)).toEqual(["Ghunna 3", "Ghunna 4", "Ghunna 5", "Ghunna 6", "Mudūd 2"]);
  });

  it("brings a course back in a later, non-consecutive week", () => {
    expect(slots(2)).toEqual(["Mudūd 3"]);
    expect(slots(3)).toEqual(["Mudūd 4", "Ṣifāt 2", "Ṣifāt 3"]);
  });

  it("opens a re-dated course on the class's date, not its row's", () => {
    // Mudūd 1's row sits in a shut Term 3 week; the class meets it in week 1.
    const mudood = term1[0].lessons.find((l) => l.courseLabel === "Mudūd")!;
    expect(mudood.href).toBe("/lessons/tajweed-3-1");
    // Ghunna 3 is listed under week 2, shut on the 6th and open on the 9th,
    // though its own row's week (Term 1 week 3 here) opened long ago
    expect(term1[1].lessons[0].href).toBeNull();
    const later = planFromLessons(rows, "Masjid An-Nabawi", tt, new Date("2026-10-09T12:00:00Z"), "student", groupOne)[1];
    expect(later[1].lessons[0].href).toBe("/lessons/tajweed-1-3");
  });
});

describe("lessonsOnSection", () => {
  const row = (weekId: string): LessonRow => ({
    id: `l-${weekId}`, title: "Ghunna lesson", series: "tajweed", position: 1, youtube_id: "x",
    weeks: { id: weekId, term_id: 1, number: 1, unlock_at: "2026-10-08T12:00:00Z" },
  });
  const sw = [{ section: "sisters", week_id: "w1", unlock_at: "2026-10-07T18:00:00Z", due_at: "2026-10-14T18:00:00Z" }];

  it("opens a lesson on its section's week", () => {
    expect(lessonsOnSection([row("w1")], sw, "sisters")[0].weeks!.unlock_at).toBe("2026-10-07T18:00:00Z");
  });

  it("leaves a week the section has no row for, and another section, alone", () => {
    const rows = [row("w2")];
    expect(lessonsOnSection(rows, sw, "sisters")[0]).toBe(rows[0]);
    expect(lessonsOnSection(rows, sw, "brothers")).toBe(rows);
  });
});
