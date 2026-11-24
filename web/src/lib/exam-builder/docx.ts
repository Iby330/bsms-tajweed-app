/**
 * The exam paper, or its mark scheme, as a Word document (.docx).
 *
 * Mirrors the printed paper (app/exam-print/[paperId]): last year's EOT2 25/26
 * layout, A4, Times New Roman 12pt, black on white. Pure given its inputs —
 * the route handler loads the paper and fetches the pictures, this only lays
 * them out — so it can be tested without a database.
 *
 * With `scheme: false` nothing here reads an option's `correct` flag or an
 * item's `answer`: the paper's file carries no answers at all.
 *
 * Qur'an words named by a ref (a prompt's `prompt_quran`, an option's
 * `quran`) are set as Arabic text in place of the picture, from `quranText`
 * (the route loads it from the mushaf data, keyed by `snippetKey`): Word has
 * no QCF page fonts, so it is the Uthmani text in the Arabic face, the way
 * Arabic typed into a question already prints here. The picture stays the
 * fallback when the text is missing. A circled letter keeps its picture: Word
 * cannot draw a circle over one letter of the text (with no picture, the
 * circled word is underlined instead). Part of an ayah never gets a label.
 *
 * Kept to what Word, Google Docs and Pages all open the same way: plain
 * paragraphs with tab stops and borders, inline pictures, and tables with an
 * explicit column grid. No Word numbering, no floating shapes.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  LineRuleType,
  Packer,
  Paragraph,
  Tab,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
  type IBorderOptions,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
import { splitRuns } from "@/components/app/mixed-text";
import { BASMALA } from "@/lib/quran/mushaf";
import { seatDaggerAlif } from "@/lib/quran/text";
import { refLabel, snippetKey } from "./quran-lines";
import { namedTitle } from "./labels";
import { formatMarks, marksLabel, numberItems, paperTotal, sectionTotal } from "./numbering";
import type { McqOption, Paper, PaperItem, QuranRef, Section } from "./types";

export type DocxImage = { data: Uint8Array; width: number; height: number; type: "png" | "jpg" | "gif" };

export type PaperDocxInput = {
  paper: Paper;
  sections: Section[];
  items: PaperItem[];
  /** storage path → the picture's bytes and pixel size. A path not here prints "[picture missing]". */
  images: Record<string, DocxImage>;
  scheme: boolean;
  /** snippetKey(ref) → the words as text (readableText). A ref not here prints its picture. */
  quranText?: Record<string, string>;
};

/** Qur'an words as runs: right to left, Arabic face, `size` pt; the circled word (if any) underlined. */
function quranRuns(text: string, ref: QuranRef, size: number): TextRun[] {
  const words = text.split(" ");
  const circled = ref.circle ? ref.circle.word - (ref.from_word ?? 1) : -1;
  const run = (t: string, underline = false) =>
    new TextRun({
      text: t,
      rightToLeft: true,
      font: { ascii: ARABIC, hAnsi: ARABIC, cs: ARABIC },
      size: PT(size),
      bold: false,
      language: { bidirectional: "ar-SA" },
      ...(underline ? { underline: {} } : {}),
    });
  if (circled < 0 || circled >= words.length) return [run(text)];
  return words.flatMap((w, i) => [...(i > 0 ? [run(" ")] : []), run(w, i === circled)]);
}

/** The ref's text when it should print as text: not when a circle needs the picture that has one. */
function quranTextFor(ref: QuranRef | null | undefined, picture: boolean, quranText: Record<string, string> | undefined): string | null {
  if (!ref || !quranText) return null;
  if (ref.circle && picture) return null;
  return quranText[snippetKey(ref)] ?? null;
}

// ── measures ─────────────────────────────────────────────────────────────

/** Twips (1/20 pt) per millimetre. */
const TW_PER_MM = 1440 / 25.4;
/** Pixels at 96 to the inch (what docx's ImageRun takes) per millimetre. */
const PX_PER_MM = 96 / 25.4;
const tw = (mm: number) => Math.round(mm * TW_PER_MM);

const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
const MARGIN_MM = 16;
const TEXT_W_MM = PAGE_W_MM - 2 * MARGIN_MM; // 178mm
const TEXT_W = tw(TEXT_W_MM);

/** Number column: "12." sits in it, the question text starts after it. */
const NUM_MM = 7;
/** Options, writing lines and answers sit in from the question text, as in print. */
const INDENT_MM = 6;
/** The tick box's column inside an option line. */
const BOX_MM = 6;

/** Picture sizing, as print-toolbar.tsx: ~170px of source picture is one mushaf line. */
const LINE_PX = 170;
const PROMPT_LINE_MM = 22;
const OPTION_LINE_MM = 13;
const PER_LINE_MM = 16;
const MAX_PICTURE_MM = 75;

// ── fonts ────────────────────────────────────────────────────────────────

const SERIF = "Times New Roman";
/** In Word on Windows and Mac; Google Docs and Pages substitute their own Arabic face. */
const ARABIC = "Traditional Arabic";
/** ☐ ☑ are not in Times New Roman; name a face that has them rather than leave it to chance. */
const SYMBOL = "Segoe UI Symbol";

const PT = (n: number) => n * 2; // docx sizes are half-points

const BOX = "☐"; // ☐
const TICKED = "☑"; // ☑

const line = (size: number, style: IBorderOptions["style"] = BorderStyle.SINGLE): IBorderOptions => ({
  style,
  size, // eighths of a point
  color: "000000",
  space: 1,
});

// ── text runs ────────────────────────────────────────────────────────────

type RunStyle = { bold?: boolean; italics?: boolean; size?: number; allCaps?: boolean };

/**
 * One line of mixed English and Arabic as runs. Arabic runs are marked
 * right-to-left and set in the Arabic face, slightly larger (the print view's
 * 1.3em), never bold (the Qur'anic face is never faux-bolded); the rest keeps
 * the paragraph's direction, so an English sentence with an Arabic word in it
 * reads in English order.
 */
function textRuns(text: string, style: RunStyle = {}, arabicScale = 1.3): TextRun[] {
  const size = style.size ?? 12;
  return splitRuns(text).map((run) =>
    run.ar
      ? new TextRun({
          text: seatDaggerAlif(run.text),
          rightToLeft: true,
          font: { ascii: ARABIC, hAnsi: ARABIC, cs: ARABIC },
          size: PT(Math.round(size * arabicScale)),
          bold: false,
          italics: false,
          language: { bidirectional: "ar-SA" },
        })
      : new TextRun({ text: run.text, ...runStyle(style) }),
  );
}

function runStyle(style: RunStyle): IRunOptions {
  return {
    bold: style.bold,
    italics: style.italics,
    allCaps: style.allCaps,
    ...(style.size ? { size: PT(style.size) } : {}),
  };
}

const symbol = (ch: string, bold = false) => new TextRun({ text: ch, font: SYMBOL, bold });

/**
 * A tab as Word itself writes one (`<w:tab/>`), not a "\t" inside the text.
 *
 * macOS Quick Look / TextEdit (Apple's own .docx importer) drop custom tab
 * stops, hanging indents and most paragraph borders, so a preview there shows
 * the marks after the question rather than at the right margin and no ruled
 * lines. Word and Google Docs honour all three.
 */
const tab = (bold = false) => new TextRun({ children: [new Tab()], bold });

/** Split on line breaks, dropping blank lines (the print view's MixedText does the same). */
function lines(text: string): string[] {
  return text.trim().split(/\n+/).map((l) => l.trim()).filter(Boolean);
}

// ── pictures ─────────────────────────────────────────────────────────────

/**
 * The size a picture prints at, in docx pixels (96 to the inch). Never larger
 * than it is (no upscaling), never wider than `maxWidthMm`, and no taller
 * than its line count allows: one line of mushaf text — a single word — is
 * capped at 22mm (13mm in an option list) so it is not blown up; a passage
 * gets 16mm a line up to 75mm. Same rule as the print toolbar's fitPicture.
 */
export function fitPicture(
  px: { width: number; height: number },
  opts: { maxWidthMm: number; option?: boolean },
): { width: number; height: number } {
  const w = Math.max(1, px.width);
  const h = Math.max(1, px.height);
  const lineCount = Math.max(1, Math.round(h / LINE_PX));
  const capMm = Math.min(
    MAX_PICTURE_MM,
    lineCount === 1 ? (opts.option ? OPTION_LINE_MM : PROMPT_LINE_MM) : lineCount * PER_LINE_MM,
  );
  const scale = Math.min(1, (capMm * PX_PER_MM) / h, (opts.maxWidthMm * PX_PER_MM) / w);
  // Down, not to nearest: a picture a hair over the measure would push past the margin.
  return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)) };
}

function pictureRun(
  path: string,
  images: Record<string, DocxImage>,
  opts: { maxWidthMm: number; option?: boolean },
): ParagraphChild {
  const img = images[path];
  if (!img) return new TextRun({ text: "[picture missing]", italics: true });
  return new ImageRun({
    type: img.type,
    data: img.data,
    transformation: fitPicture(img, opts),
    altText: { name: "Arabic", title: "Arabic", description: "Arabic text for this question" },
  });
}

// ── reading a picture's pixel size from its bytes ────────────────────────

/**
 * The format and pixel size of a PNG, JPEG or GIF, from its header bytes.
 * Null for anything else, or a file too short or malformed to say. No image
 * library: PNG keeps the size in IHDR, GIF in its logical screen descriptor,
 * JPEG in the first start-of-frame marker.
 */
export function readImageSize(
  bytes: Uint8Array,
): { type: "png" | "jpg" | "gif"; width: number; height: number } | null {
  const b = bytes;
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u32be = (i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);

  // PNG: 8-byte signature, then the IHDR chunk: width and height at 16 and 20.
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const width = u32be(16);
    const height = u32be(20);
    return width > 0 && height > 0 ? { type: "png", width, height } : null;
  }

  // GIF: "GIF87a"/"GIF89a", then width and height little-endian at 6 and 8.
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    const width = b[6] | (b[7] << 8);
    const height = b[8] | (b[9] << 8);
    return width > 0 && height > 0 ? { type: "gif", width, height } : null;
  }

  // JPEG: SOI, then markers until a start-of-frame (C0–CF bar C4, C8, CC).
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) { i += 1; continue; } // fill byte
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = u16be(i + 2);
      if (len < 2) return null;
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = u16be(i + 5);
        const width = u16be(i + 7);
        return width > 0 && height > 0 ? { type: "jpg", width, height } : null;
      }
      i += 2 + len;
    }
    return null;
  }

  return null;
}

// ── the paper ────────────────────────────────────────────────────────────

/** "Section C - Practical Component - 9 marks" already says its total; don't print it twice. */
const ENDS_WITH_MARKS = /\d+(?:\.\d+)?\s*marks?\s*\)?\s*$/i;

function sectionHeading(section: Section, total: number): string {
  const title = section.title.trim();
  return ENDS_WITH_MARKS.test(title) ? title : `${title} (${formatMarks(total)} marks)`;
}


function header(paper: Paper, total: number, scheme: boolean): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      children: [new TextRun({ text: "BSMS Tajweed", bold: true, size: PT(14) })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { before: 20 },
      children: [
        ...textRuns(paper.title.trim() || "Exam paper", { bold: true }),
        ...(scheme ? [new TextRun({ text: " — MARK SCHEME", bold: true })] : []),
      ],
    }),
  ];
  if (paper.date_label.trim()) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: true,
        children: textRuns(paper.date_label.trim(), { italics: true }),
      }),
    );
  }
  out.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      keepNext: true,
      spacing: { before: 40 },
      children: [new TextRun(`Max Marks: ${formatMarks(total)}`)],
    }),
  );
  if (paper.duration_label.trim()) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        keepNext: true,
        children: textRuns(`Duration: ${paper.duration_label.trim()}`),
      }),
    );
  }

  const notes = paper.notes.map((n) => n.trim()).filter(Boolean);
  if (notes.length > 0) {
    out.push(new Paragraph({ keepNext: true, spacing: { before: 80 }, children: [new TextRun("Note:")] }));
    notes.forEach((note, i) => {
      out.push(
        new Paragraph({
          keepNext: true,
          indent: { left: tw(15), hanging: tw(6) },
          tabStops: [{ type: TabStopType.LEFT, position: tw(15) }],
          spacing: { before: 20 },
          children: [new TextRun(`${i + 1}.`), tab(), ...textRuns(note.replace(/\s*\n\s*/g, " "), {}, 1.15)],
        }),
      );
    });
  }

  // The rule under the header: an empty paragraph's bottom border, full measure.
  out.push(
    new Paragraph({
      spacing: { before: 0, after: 120 },
      border: { bottom: line(12) },
      children: [],
    }),
  );
  return out;
}

/** "1.  Bold question text ……… (1 mark)", then any further lines of the prompt and its pictures. */
function questionHead(
  item: PaperItem,
  number: number | undefined,
  images: Record<string, DocxImage>,
  firstInSection: boolean,
  quranText: Record<string, string> | undefined,
): Paragraph[] {
  const promptLines = lines(item.prompt);
  const first = promptLines[0] ?? "";
  const rest = promptLines.slice(1);
  const out: Paragraph[] = [
    new Paragraph({
      keepNext: true,
      keepLines: true,
      // The section heading sits closer to its first question than questions do to each other.
      spacing: { before: firstInSection ? 120 : 240 },
      indent: { left: tw(NUM_MM), hanging: tw(NUM_MM) },
      tabStops: [
        { type: TabStopType.LEFT, position: tw(NUM_MM) },
        { type: TabStopType.RIGHT, position: TEXT_W },
      ],
      children: [
        new TextRun({ text: `${number ?? ""}.`, bold: true }),
        tab(true),
        ...textRuns(first, { bold: true }),
        tab(true),
        new TextRun({ text: marksLabel(item.marks), bold: true }),
      ],
    }),
  ];
  for (const l of rest) {
    out.push(
      new Paragraph({
        keepNext: true,
        keepLines: true,
        indent: { left: tw(NUM_MM) },
        children: textRuns(l, { bold: true }),
      }),
    );
  }

  const pictures = item.prompt_images.filter(Boolean);
  const words = quranTextFor(item.prompt_quran, pictures.length > 0, quranText);
  const label = item.prompt_quran ? refLabel(item.prompt_quran) : null;
  if (words && item.prompt_quran) {
    const ar = (children: TextRun[], keepNext: boolean) =>
      new Paragraph({
        keepNext,
        keepLines: true,
        bidirectional: true,
        alignment: AlignmentType.CENTER,
        spacing: { before: 80 },
        indent: { left: tw(NUM_MM) },
        children,
      });
    if (item.prompt_quran.basmala) out.push(ar(quranRuns(BASMALA, { ...item.prompt_quran, circle: undefined }, 18), true));
    out.push(ar(quranRuns(words, item.prompt_quran, 18), true));
  } else if (pictures.length > 0) {
    for (const path of pictures) {
      out.push(
        new Paragraph({
          keepNext: true,
          spacing: { before: 80 },
          indent: { left: tw(NUM_MM) },
          children: [pictureRun(path, images, { maxWidthMm: TEXT_W_MM - NUM_MM })],
        }),
      );
    }
  } else if (label) {
    out.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: 80 },
        indent: { left: tw(NUM_MM) },
        children: [new TextRun({ text: `(${label})`, italics: true, size: PT(11) })],
      }),
    );
  }
  return out;
}

/**
 * One paragraph per option (two when it has text and a picture): "☐  text".
 * `ticked` is only ever passed on the mark scheme. Every option but the last
 * keeps with the next, so a question's options stay on one page with it.
 */
function optionParagraphs(
  options: McqOption[],
  images: Record<string, DocxImage>,
  ticked: (o: McqOption) => boolean,
  /** Something (the answer box) follows that the last option should stay with. */
  keepLast: boolean,
  quranText: Record<string, string> | undefined,
): Paragraph[] {
  const out: Paragraph[] = [];
  const left = tw(INDENT_MM + NUM_MM + BOX_MM);
  options.forEach((o, i) => {
    const last = i === options.length - 1 && !keepLast;
    const on = ticked(o);
    const text = o.text.trim();
    const words = quranTextFor(o.quran, Boolean(o.image), quranText);
    // The option's Arabic: its typeset words, else its picture.
    const arabic: ParagraphChild | null = words && o.quran
      ? null
      : o.image ? pictureRun(o.image, images, { maxWidthMm: TEXT_W_MM - NUM_MM - INDENT_MM - BOX_MM, option: true }) : null;
    const arabicRuns: ParagraphChild[] = words && o.quran ? quranRuns(words, o.quran, 16) : arabic ? [arabic] : [];
    const correctBox = on
      ? {
          border: { top: line(10), bottom: line(10), left: line(10), right: line(10) },
          shading: { type: "clear" as const, color: "auto", fill: "E8E8E8" },
        }
      : {};
    const box = [symbol(on ? TICKED : BOX, on), tab(on)];
    const base = {
      indent: { left, hanging: tw(BOX_MM) },
      tabStops: [{ type: TabStopType.LEFT, position: left }],
      spacing: { before: i === 0 ? 80 : 30 },
      ...correctBox,
    };
    if (text) {
      out.push(
        new Paragraph({
          ...base,
          keepNext: !last || arabicRuns.length > 0,
          children: [...box, ...textRuns(text.replace(/\s*\n\s*/g, " "), { bold: on })],
        }),
      );
      if (arabicRuns.length > 0) {
        out.push(
          new Paragraph({
            keepNext: !last,
            indent: { left },
            spacing: { before: 20 },
            children: arabicRuns,
          }),
        );
      }
    } else {
      out.push(
        new Paragraph({
          ...base,
          keepNext: !last,
          children: [...box, ...(arabicRuns.length > 0 ? arabicRuns : [new TextRun("")])],
        }),
      );
    }
  });
  return out;
}

/** Ruled writing lines, 9mm apart, as the printed paper's. */
function writingLines(count: number): Paragraph[] {
  const rule = line(5);
  return Array.from(
    { length: count },
    (_, i) =>
      new Paragraph({
        indent: { left: tw(NUM_MM + INDENT_MM) },
        spacing: { line: tw(9), lineRule: LineRuleType.EXACT, before: i === 0 ? 40 : 0 },
        border: { bottom: rule, between: rule },
        children: [],
      }),
  );
}

/** Mark scheme: the answer in a bordered box headed "ANSWER", line breaks kept. */
function answerBox(answer: string): Table {
  const width = TEXT_W - tw(NUM_MM + INDENT_MM);
  const border = line(8);
  return new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths: [width],
    indent: { size: tw(NUM_MM + INDENT_MM), type: WidthType.DXA },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: width, type: WidthType.DXA },
            margins: { top: tw(1.2), bottom: tw(1.5), left: tw(2.5), right: tw(2.5) },
            children: [
              new Paragraph({
                keepNext: true,
                spacing: { after: 40 },
                children: [new TextRun({ text: "Answer", bold: true, allCaps: true, size: PT(9), characterSpacing: 10 })],
              }),
              ...answer.split(/\n/).map(
                (l) => new Paragraph({ children: l.trim() ? textRuns(l.trim()) : [] }),
              ),
            ],
          }),
        ],
      }),
    ],
  });
}

function answerNeeded(text: string): Paragraph {
  const dashed = line(10, BorderStyle.DASHED);
  return new Paragraph({
    spacing: { before: 100 },
    indent: { left: tw(NUM_MM + INDENT_MM) },
    border: { top: dashed, bottom: dashed, left: dashed, right: dashed },
    children: [new TextRun({ text, bold: true })],
  });
}

function question(
  item: PaperItem,
  number: number | undefined,
  images: Record<string, DocxImage>,
  scheme: boolean,
  firstInSection: boolean,
  quranText: Record<string, string> | undefined,
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = questionHead(item, number, images, firstInSection, quranText);
  const options = item.kind === "mcq" ? (item.options ?? []) : [];

  if (scheme) {
    // Only on the mark scheme are `correct` and `answer` read at all.
    const answer = (item.answer ?? "").trim();
    const noCorrect = item.kind === "mcq" && !options.some((o) => o.correct);
    if (options.length > 0) out.push(...optionParagraphs(options, images, (o) => o.correct, true, quranText));
    if (noCorrect) out.push(answerNeeded("Answer needed: no option is marked correct."));
    // An MCQ's written answer (a reason, a breakdown) shows too, as on the printed scheme.
    if (answer) out.push(gap(true), answerBox(answer));
    else if (item.kind === "short") out.push(answerNeeded("Answer needed"));
    else if (!noCorrect) out.push(gap(false));
    return out;
  }

  if (options.length > 0) {
    out.push(...optionParagraphs(options, images, () => false, false, quranText));
  } else if (item.kind === "short" && item.answer_lines > 0) {
    out.push(...writingLines(item.answer_lines));
  } else {
    // The prompt keeps with the next paragraph; end the chain here.
    out.push(gap(false));
  }
  return out;
}

/** A small gap; `keep` holds it (and what is above) to what follows. */
const gap = (keep: boolean) =>
  new Paragraph({ spacing: { line: 100, lineRule: LineRuleType.EXACT }, keepNext: keep, children: [] });

function practical(section: Section): (Paragraph | Table)[] {
  const p = section.practical ?? { rows: 3, marks: 0, columns: [] };
  const columns = p.columns.length > 0 ? p.columns : [""];
  const firstW = tw(28);
  const restW = Math.floor((TEXT_W - firstW) / columns.length);
  const widths = [firstW, ...columns.map(() => restW)];
  const border = line(6);
  const cell = (text: string, bold: boolean, w: number) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA },
      margins: { top: tw(1), bottom: tw(1), left: tw(1.8), right: tw(1.8) },
      children: [new Paragraph({ keepNext: true, children: text ? textRuns(text, { bold }) : [] })],
    });

  return [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      keepNext: true,
      spacing: { after: 80 },
      children: [new TextRun({ text: `(            / ${formatMarks(p.marks)} Marks)`, bold: true })],
    }),
    new Table({
      width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
      columnWidths: widths,
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: [
        new TableRow({
          keepNext: true,
          cantSplit: true,
          tableHeader: true,
          children: [cell("", true, widths[0]), ...columns.map((c, i) => cell(c, true, widths[i + 1]))],
        }),
        ...Array.from(
          { length: Math.max(0, p.rows) },
          (_, r) =>
            new TableRow({
              keepNext: r < p.rows - 1,
              cantSplit: true,
              height: { value: tw(16), rule: HeightRule.ATLEAST },
              children: [cell(`Question ${r + 1}`, true, widths[0]), ...columns.map((_, i) => cell("", false, widths[i + 1]))],
            }),
        ),
      ],
    }),
  ];
}

/** Builds the .docx. `scheme` adds the answers; without it there are none in the file. */
export async function buildPaperDocx(input: PaperDocxInput): Promise<Uint8Array> {
  const { paper, sections, items, images, scheme, quranText } = input;
  const numbers = numberItems(sections, items);
  const ordered = [...items].sort((a, b) => a.position - b.position);

  const body: (Paragraph | Table)[] = header(paper, paperTotal(sections, items), scheme);

  sections.forEach((section, si) => {
    body.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: true,
        spacing: { before: si === 0 ? 0 : 280, after: 0 },
        children: textRuns(sectionHeading(section, sectionTotal(section, items)), { bold: true, size: 14 }),
      }),
    );
    if (section.kind === "practical") {
      body.push(...practical(section));
      return;
    }
    const mine = ordered.filter((i) => i.section_id === section.id);
    mine.forEach((item, n) => {
      body.push(...question(item, numbers[item.id], images, scheme, n === 0, quranText));
    });
  });

  const doc = new Document({
    creator: "BSMS Tajweed",
    // The file's own title: the paper's name rides along here, never on the page.
    title: [namedTitle(paper), scheme ? "Mark scheme" : ""].filter(Boolean).join(" — "),
    styles: {
      default: {
        document: {
          run: { font: { ascii: SERIF, hAnsi: SERIF, cs: ARABIC, eastAsia: SERIF }, size: PT(12) },
          paragraph: { spacing: { before: 0, after: 0 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: tw(PAGE_W_MM), height: tw(PAGE_H_MM) },
            margin: { top: tw(MARGIN_MM), bottom: tw(18), left: tw(MARGIN_MM), right: tw(MARGIN_MM), header: tw(8), footer: tw(8) },
          },
        },
        children: body,
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
