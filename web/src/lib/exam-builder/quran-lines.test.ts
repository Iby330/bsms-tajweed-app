import { describe, expect, it } from "vitest";
import type { QuranWord } from "@/lib/quran/mushaf";
import {
  ayahSpans,
  flowingAyahs,
  hasAllGlyphs,
  isQuranRef,
  LINE_EM,
  ONE_LINE_MAX,
  setLines,
  sliceRef,
  snippetKey,
  isPartialRange,
  parseSnippetKey,
  questionRefs,
  refLabel,
  snippetLabel,
  snippetLines,
  snippetPages,
} from "./quran-lines";

const w = (ayah: number, position: number, page: number, line: number, isEnd = false, glyph: string | null = "x"): QuranWord => ({
  surah: 31,
  ayah,
  position,
  text: isEnd ? String(ayah) : `w${ayah}.${position}`,
  glyph,
  isEnd,
  page,
  line,
});

// Luqman 18 ends on page 411 line 15; 19 starts at the top of page 412.
const PASSAGE: QuranWord[] = [
  w(18, 1, 411, 14),
  w(18, 2, 411, 14),
  w(18, 3, 411, 15),
  w(18, 4, 411, 15, true),
  w(19, 1, 412, 1),
  w(19, 2, 412, 1),
  w(19, 3, 412, 2),
  w(19, 4, 412, 2, true),
];

describe("snippetKey", () => {
  it("names the surah and ayah range, and the word bounds only when given", () => {
    expect(snippetKey({ surah: 31, from_ayah: 19, to_ayah: 19 })).toBe("31:19-19");
    expect(snippetKey({ surah: 104, from_ayah: 1, to_ayah: 2, from_word: 2, to_word: 3 })).toBe("104:1-2@2-3");
    expect(snippetKey({ surah: 1, from_ayah: 1, to_ayah: 7, to_word: 4 })).toBe("1:1-7@-4");
  });
});

describe("isQuranRef", () => {
  it("accepts a sane range and rejects nonsense", () => {
    expect(isQuranRef({ surah: 31, from_ayah: 19, to_ayah: 19 })).toBe(true);
    expect(isQuranRef({ surah: 0, from_ayah: 1, to_ayah: 1 })).toBe(false);
    expect(isQuranRef({ surah: 115, from_ayah: 1, to_ayah: 1 })).toBe(false);
    expect(isQuranRef({ surah: 2, from_ayah: 5, to_ayah: 4 })).toBe(false);
    expect(isQuranRef({ surah: 2, from_ayah: 1.5, to_ayah: 4 })).toBe(false);
    expect(isQuranRef(null)).toBe(false);
  });
});

describe("ayahSpans", () => {
  it("asks once per surah, covering every ref in it", () => {
    expect(
      ayahSpans([
        { surah: 31, from_ayah: 19, to_ayah: 19 },
        { surah: 104, from_ayah: 1, to_ayah: 2 },
        { surah: 31, from_ayah: 12, to_ayah: 13 },
        { surah: 31, from_ayah: 19, to_ayah: 19, from_word: 3 },
      ]),
    ).toEqual([
      { surah: 31, from: 12, to: 19 },
      { surah: 104, from: 1, to: 2 },
    ]);
  });
});

describe("sliceRef", () => {
  it("keeps only the ayahs asked for, in reading order", () => {
    const shuffled = [...PASSAGE].reverse();
    expect(sliceRef(shuffled, { surah: 31, from_ayah: 19, to_ayah: 19 }).map((x) => `${x.ayah}:${x.position}`)).toEqual([
      "19:1",
      "19:2",
      "19:3",
      "19:4",
    ]);
  });

  it("slices a word range: from_word in the first ayah, to_word in the last", () => {
    const got = sliceRef(PASSAGE, { surah: 31, from_ayah: 18, to_ayah: 19, from_word: 3, to_word: 2 });
    expect(got.map((x) => `${x.ayah}:${x.position}`)).toEqual(["18:3", "18:4", "19:1", "19:2"]);
  });

  it("ignores words of another surah", () => {
    expect(sliceRef([...PASSAGE, { ...PASSAGE[4], surah: 32 }], { surah: 31, from_ayah: 19, to_ayah: 19 })).toHaveLength(4);
  });
});

describe("snippetLines", () => {
  it("groups a range spanning two lines and two pages by printed line, in the page's font", () => {
    const lines = snippetLines(PASSAGE);
    expect(lines.map((l) => `${l.page}/${l.line}:${l.words.length}:${l.font}`)).toEqual([
      "411/14:2:QCF_P411",
      "411/15:2:QCF_P411",
      "412/1:2:QCF_P412",
      "412/2:2:QCF_P412",
    ]);
  });

  it("keeps an ayah-end glyph on the line of the ayah it closes", () => {
    const lines = snippetLines(PASSAGE);
    expect(lines[1].words.at(-1)).toMatchObject({ ayah: 18, isEnd: true });
    expect(lines[2].words[0]).toMatchObject({ ayah: 19, position: 1, isEnd: false });
    expect(lines[3].words.at(-1)).toMatchObject({ ayah: 19, isEnd: true });
  });

  it("lists each page font once", () => {
    expect(snippetPages(PASSAGE)).toEqual([411, 412]);
  });
});

describe("setLines", () => {
  // Luqman 19 as printed: three words end page 412's first line, the rest run on.
  const AYAH_19: QuranWord[] = [
    ...[1, 2, 3].map((p) => w(19, p, 412, 1)),
    ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((p) => w(19, p, 412, 2)),
    w(19, 13, 412, 2, true),
  ];

  it("sets a short range that straddles a mushaf line break as one line", () => {
    const got = setLines(AYAH_19);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ page: 412, font: "QCF_P412", joined: true });
    expect(got[0].words.map((x) => x.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    // Wider than a mushaf line, so the type scales down to fit rather than overflow.
    expect(got[0].em).toBeGreaterThanOrEqual(LINE_EM);
  });

  it("keeps the mushaf's lines for a long passage (Al-Fatihah)", () => {
    const fatihah: QuranWord[] = [];
    let n = 0;
    for (let line = 2; line <= 8; line++) for (let i = 0; i < 6; i++) fatihah.push({ ...w(1, ++n, 1, line), surah: 1 });
    expect(fatihah.length).toBeGreaterThan(ONE_LINE_MAX);
    const got = setLines(fatihah);
    expect(got).toHaveLength(7);
    expect(got.every((l) => !l.joined && l.em === LINE_EM)).toBe(true);
  });

  it("keeps the mushaf's lines when a short range crosses a page (two fonts)", () => {
    const got = setLines(PASSAGE);
    expect(got).toHaveLength(4);
    expect(got.some((l) => l.joined)).toBe(false);
  });

  it("leaves a one-line range as it is", () => {
    const got = setLines(AYAH_19.slice(3));
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ line: 2, joined: false, em: LINE_EM });
  });
});

describe("hasAllGlyphs", () => {
  it("is false as soon as one word has no printed glyph", () => {
    expect(hasAllGlyphs(PASSAGE)).toBe(true);
    expect(hasAllGlyphs([...PASSAGE, w(20, 1, 412, 3, false, null)])).toBe(false);
    expect(hasAllGlyphs([])).toBe(false);
  });
});

describe("flowingAyahs", () => {
  it("joins each ayah's words and marks only the ayahs whose end is in range", () => {
    const got = flowingAyahs(sliceRef(PASSAGE, { surah: 31, from_ayah: 18, to_ayah: 19, from_word: 3, to_word: 2 }));
    expect(got).toEqual([
      { ayah: 18, text: "w18.3", ended: true },
      { ayah: 19, text: "w19.1 w19.2", ended: false },
    ]);
  });

  it("writes آ decomposed, which Uthmanic Hafs can draw", () => {
    const got = flowingAyahs([{ ...w(1, 1, 1, 1), text: "ٱلضَّآلِّينَ" }]);
    expect(got[0].text).not.toContain("آ");
    expect(got[0].text).toContain("آ");
  });
});

describe("snippetLabel", () => {
  it("says the surah and the ayah or ayat", () => {
    expect(snippetLabel({ surah: 31, from_ayah: 19, to_ayah: 19 })).toBe("Surah 31, ayah 19");
    expect(snippetLabel({ surah: 104, from_ayah: 1, to_ayah: 2 })).toBe("Surah 104, ayat 1–2");
  });
});

describe("refLabel", () => {
  it("names a whole ayah or ayat, and nothing for part of an ayah", () => {
    expect(refLabel({ surah: 104, from_ayah: 1, to_ayah: 2 })).toBe("Surah 104, ayat 1–2");
    // 61 mapped phrases are found in several places: a label could name the wrong one.
    expect(refLabel({ surah: 2, from_ayah: 27, to_ayah: 27, from_word: 5, to_word: 6 })).toBeNull();
    expect(refLabel({ surah: 2, from_ayah: 27, to_ayah: 27, to_word: 3 })).toBeNull();
  });
});

describe("isPartialRange", () => {
  it("is partial when it starts after the first word or stops before the ayah's marker", () => {
    expect(isPartialRange([w(3, 1, 1, 1), w(3, 2, 1, 1), w(3, 3, 1, 1, true)])).toBe(false);
    expect(isPartialRange(PASSAGE)).toBe(false);
    // From the sixth word to the marker: the rosette shows, but it is still part of an ayah.
    expect(isPartialRange([w(3, 6, 1, 1), w(3, 7, 1, 1, true)])).toBe(true);
    expect(isPartialRange([w(27, 5, 1, 1), w(27, 6, 1, 1)])).toBe(true);
  });
});

describe("parseSnippetKey", () => {
  it("reads back every key snippetKey writes", () => {
    const refs = [
      { surah: 31, from_ayah: 19, to_ayah: 19 },
      { surah: 104, from_ayah: 1, to_ayah: 2, from_word: 2, to_word: 3 },
      { surah: 2, from_ayah: 27, to_ayah: 27, to_word: 4 },
      { surah: 2, from_ayah: 27, to_ayah: 27, from_word: 4 },
    ];
    for (const r of refs) expect(parseSnippetKey(snippetKey(r))).toEqual(r);
    expect(parseSnippetKey("nonsense")).toBeNull();
    expect(parseSnippetKey("200:1-1")).toBeNull();
  });
});

describe("questionRefs", () => {
  it("collects the prompt's ref and every option's", () => {
    const opt = { surah: 2, from_ayah: 27, to_ayah: 27, from_word: 5, to_word: 6 };
    expect(
      questionRefs({
        prompt_quran: { surah: 31, from_ayah: 19, to_ayah: 19 },
        options: [{ text: "", image: "bank/a.png", correct: false, quran: opt }, { text: "B", image: null, correct: true }],
      }),
    ).toEqual([{ surah: 31, from_ayah: 19, to_ayah: 19 }, opt]);
    expect(questionRefs({ prompt_quran: null, options: null })).toEqual([]);
  });
});

describe("ayahSpans across a long surah", () => {
  it("asks for nearby ayat together and far ones apart", () => {
    expect(
      ayahSpans([
        { surah: 2, from_ayah: 27, to_ayah: 27 },
        { surah: 2, from_ayah: 255, to_ayah: 255 },
        { surah: 2, from_ayah: 30, to_ayah: 31 },
      ]),
    ).toEqual([
      { surah: 2, from: 27, to: 31 },
      { surah: 2, from: 255, to: 255 },
    ]);
  });
});
