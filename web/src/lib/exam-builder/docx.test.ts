import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildPaperDocx, fitPicture, readImageSize, type DocxImage } from "./docx";
import type { Paper, PaperItem, Section } from "./types";

const PAPER_ID = "00000000-0000-4000-8000-000000000001";

const paper = {
  id: PAPER_ID,
  owner_id: "00000000-0000-4000-8000-0000000000aa",
  title: "End Of Term 1 Exam",
  name: "Advanced",
  date_label: "December 2026",
  duration_label: "90 mins",
  code: "EOT1",
  season: "26/27",
  notes: ["Section A is multiple choice.", "Section B is short answer."],
  status: "draft",
} as unknown as Paper;

const section = (id: string, position: number, title: string, extra: Partial<Section> = {}) =>
  ({ id, paper_id: PAPER_ID, position, title, kind: "questions", practical: null, ...extra }) as unknown as Section;

const sections: Section[] = [
  section("s-a", 1, "Section A - Multiple Choice Questions"),
  section("s-b", 2, "Section B - Short Answer Questions"),
  section("s-c", 3, "Section C - Practical Component", {
    kind: "practical",
    practical: { rows: 3, marks: 9, columns: ["Verse", "Surah", "Order - before/after"] },
  }),
];

const item = (over: Partial<PaperItem>) =>
  ({
    id: "i",
    paper_id: PAPER_ID,
    section_id: "s-a",
    position: 1,
    kind: "mcq",
    prompt: "",
    prompt_images: [],
    prompt_quran: null,
    options: null,
    select_many: false,
    marks: 1,
    answer: null,
    answer_lines: 0,
    bank_question_id: null,
    ...over,
  }) as unknown as PaperItem;

const items: PaperItem[] = [
  item({
    id: "q1",
    prompt: "How many letters are included in the Huruf Al-Isti'laa?",
    options: [
      { text: "Five", image: null, correct: false },
      { text: "Seven", image: null, correct: true },
    ],
  }),
  item({
    id: "q2",
    section_id: "s-b",
    kind: "short",
    prompt: "Why is the Qur'an described as a refuge? Explain with رَحْمَة in your answer.",
    marks: 2,
    answer: "It is a sanctuary away from the chaos\nof the world (1)",
    answer_lines: 3,
  }),
];

/** A 1×1 PNG: signature, IHDR (width 1, height 1), IDAT, IEND. */
const PNG_1X1 = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

async function documentXml(scheme: boolean, images: Record<string, DocxImage> = {}, list = items) {
  const bytes = await buildPaperDocx({ paper, sections, items: list, images, scheme });
  const files = unzipSync(bytes);
  return { xml: strFromU8(files["word/document.xml"]), files };
}

/** The visible text of document.xml, runs joined. */
const text = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");

describe("buildPaperDocx", () => {
  it("lays out the paper: header, sections with totals, questions with marks", async () => {
    const { xml } = await documentXml(false);
    const t = text(xml);
    expect(t).toContain("BSMS Tajweed");
    expect(t).toContain("End Of Term 1 Exam");
    expect(t).toContain("Max Marks: 12");
    expect(t).toContain("Duration: 90 mins");
    expect(t).toContain("Section A - Multiple Choice Questions (1 marks)");
    expect(t).toContain("Section B - Short Answer Questions (2 marks)");
    expect(t).toContain("Section C - Practical Component (9 marks)");
    expect(t).toContain("How many letters are included in the Huruf Al-Isti&apos;laa?");
    expect(t).toContain("(1 mark)");
    expect(t).toContain("(2 marks)");
    expect(t).toContain("☐");
    expect(t).toContain("Question 3");
    expect(t).toContain("Order - before/after");
    // The marks sit on a right tab stop at the text width (178mm).
    expect(xml).toMatch(/<w:tab w:val="right" w:pos="10091"\/>/);
  });

  it("keeps the paper's name off the page and puts it in the file's own title", async () => {
    const { xml, files } = await documentXml(false);
    expect(text(xml)).not.toContain("Advanced");
    expect(strFromU8(files["docProps/core.xml"])).toContain("End Of Term 1 Exam - Advanced");
    const scheme = await documentXml(true);
    expect(text(scheme.xml)).not.toContain("Advanced");
  });

  it("carries no answers on the paper", async () => {
    const { xml } = await documentXml(false);
    expect(xml).not.toContain("sanctuary away from the chaos");
    expect(xml).not.toContain("☑");
    expect(text(xml)).not.toContain("Answer needed");
    expect(xml).not.toContain("<w:caps/>"); // the scheme's "ANSWER" box label
  });

  it("the mark scheme ticks the correct option and shows the answer, line breaks kept", async () => {
    const { xml } = await documentXml(true);
    const t = text(xml);
    expect(t).toContain("MARK SCHEME");
    expect(t).toContain("☑");
    expect(t).toContain("It is a sanctuary away from the chaos");
    expect(t).toContain("of the world (1)");
    // Two paragraphs, not one run-on line.
    expect(xml).toMatch(/chaos<\/w:t><\/w:r><\/w:p><w:p>/);
  });

  it("flags a question with no answer on the scheme", async () => {
    const bare = [items[0], { ...items[1], answer: null }, item({ id: "q3", options: [{ text: "x", image: null, correct: false }] })];
    const t = text((await documentXml(true, {}, bare)).xml);
    expect(t).toContain("Answer needed");
    expect(t).toContain("Answer needed: no option is marked correct.");
  });

  it("marks Arabic runs right-to-left in the Arabic face, English left as it is", async () => {
    const { xml } = await documentXml(false);
    const arabicRun = xml.match(/<w:r>(?:(?!<\/w:r>).)*رَحْمَة(?:(?!<\/w:r>).)*<\/w:r>/)?.[0] ?? "";
    expect(arabicRun).toContain("<w:rtl/>");
    expect(arabicRun).toContain('w:cs="Traditional Arabic"');
    const englishRun = xml.match(/<w:r>(?:(?!<\/w:r>).)*Why is the Qur(?:(?!<\/w:r>).)*<\/w:r>/)?.[0] ?? "";
    expect(englishRun).not.toContain("<w:rtl/>");
  });

  it("embeds pictures it has and says so for one it does not", async () => {
    const withPics = [
      { ...items[0], prompt_images: ["bank/a.png", "bank/gone.png"] },
      items[1],
    ];
    const { xml, files } = await documentXml(false, { "bank/a.png": { data: PNG_1X1, width: 1, height: 1, type: "png" } }, withPics);
    expect(Object.keys(files).filter((f) => f.startsWith("word/media/"))).toHaveLength(1);
    expect(text(xml)).toContain("[picture missing]");
  });
});

describe("fitPicture", () => {
  const mm = (px: number) => (px * 25.4) / 96;

  it("caps a single line of Arabic at 22mm tall, 13mm in an option", () => {
    const p = fitPicture({ width: 400, height: 170 }, { maxWidthMm: 170 });
    expect(mm(p.height)).toBeCloseTo(22, 0);
    expect(p.width / p.height).toBeCloseTo(400 / 170, 1);
    expect(mm(fitPicture({ width: 400, height: 170 }, { maxWidthMm: 170, option: true }).height)).toBeCloseTo(13, 0);
  });

  it("gives a passage room by its line count, never past 75mm", () => {
    expect(mm(fitPicture({ width: 600, height: 510 }, { maxWidthMm: 170 }).height)).toBeCloseTo(48, 0);
    expect(mm(fitPicture({ width: 600, height: 2000 }, { maxWidthMm: 170 }).height)).toBeLessThanOrEqual(75.1);
  });

  it("never upscales and never overflows the measure", () => {
    expect(fitPicture({ width: 40, height: 30 }, { maxWidthMm: 170 })).toEqual({ width: 40, height: 30 });
    const wide = fitPicture({ width: 3000, height: 170 }, { maxWidthMm: 170 });
    expect(mm(wide.width)).toBeLessThanOrEqual(170.1);
  });
});

describe("readImageSize", () => {
  it("reads a PNG's IHDR", () => {
    expect(readImageSize(PNG_1X1)).toEqual({ type: "png", width: 1, height: 1 });
  });

  it("reads a GIF's screen size", () => {
    const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x2c, 0x01, 0x96, 0x00, 0, 0]);
    expect(readImageSize(gif)).toEqual({ type: "gif", width: 300, height: 150 });
  });

  it("finds a JPEG's start-of-frame past an APP0 segment", () => {
    const jpg = Uint8Array.from([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0, length 4
      0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(readImageSize(jpg)).toEqual({ type: "jpg", width: 800, height: 600 });
  });

  it("is null for anything else", () => {
    expect(readImageSize(Uint8Array.from([1, 2, 3, 4]))).toBeNull();
    expect(readImageSize(new Uint8Array(0))).toBeNull();
    expect(readImageSize(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBeNull();
  });
});
