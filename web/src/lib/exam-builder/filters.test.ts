import { describe, expect, it } from "vitest";
import { filterBank, markValues, topicCounts } from "./filters";
import type { Topic } from "./types";

const TOPICS: Topic[] = [
  { id: "sifaat", parent_id: null, title: "Sifaat", position: 40 },
  { id: "sifaat.ra", parent_id: "sifaat", title: "Ra", position: 43 },
  { id: "sifaat.hams", parent_id: "sifaat", title: "Hams", position: 45 },
  { id: "noon", parent_id: null, title: "Noon", position: 20 },
  { id: "noon.iqlaab", parent_id: "noon", title: "Iqlaab", position: 24 },
  { id: "seerah", parent_id: null, title: "Seerah", position: 90 },
];

const q = (id: string, topic_id: string, extra: Partial<{
  kind: "mcq" | "short"; marks: number | null; used_in: string[]; prompt: string; answer: string | null;
}> = {}) => ({
  id, topic_id, kind: "short" as const, marks: 1, used_in: [] as string[],
  prompt: `prompt ${id}`, answer: null as string | null, ...extra,
});

const BANK = [
  q("ra1", "sifaat.ra", { kind: "mcq", marks: 1, used_in: ["EOT2 25/26"], prompt: "When is the Ra heavy?" }),
  q("ra2", "sifaat.ra", { marks: 2, answer: "Tafkheem when it carries a fatha" }),
  q("hams1", "sifaat.hams", { marks: 1.5 }),
  q("iq1", "noon.iqlaab", { kind: "mcq", marks: null }),
  q("se1", "seerah", { marks: 2, prompt: "Name the Prophet’s ﷺ mother" }),
];

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("filterBank", () => {
  it("returns everything for an empty filter", () => {
    expect(ids(filterBank(BANK, {}, TOPICS))).toEqual(["ra1", "ra2", "hams1", "iq1", "se1"]);
  });

  it("matches a leaf topic exactly", () => {
    expect(ids(filterBank(BANK, { topicIds: ["sifaat.ra"] }, TOPICS))).toEqual(["ra1", "ra2"]);
  });

  it("matches every child of a parent topic", () => {
    expect(ids(filterBank(BANK, { topicIds: ["sifaat"] }, TOPICS))).toEqual(["ra1", "ra2", "hams1"]);
  });

  it("matches a standalone subject and unions several topics", () => {
    expect(ids(filterBank(BANK, { topicIds: ["seerah", "noon"] }, TOPICS))).toEqual(["iq1", "se1"]);
  });

  it("filters by any of the chosen mark values, halves included", () => {
    expect(ids(filterBank(BANK, { marks: [1.5, 2] }, TOPICS))).toEqual(["ra2", "hams1", "se1"]);
  });

  it("keeps only questions never used in an exam", () => {
    expect(ids(filterBank(BANK, { unusedOnly: true }, TOPICS))).not.toContain("ra1");
  });

  it("filters by kind", () => {
    expect(ids(filterBank(BANK, { kind: "mcq" }, TOPICS))).toEqual(["ra1", "iq1"]);
  });

  it("searches prompt and answer, ignoring case and surrounding space", () => {
    expect(ids(filterBank(BANK, { text: "  RA HEAVY " }, TOPICS))).toEqual(["ra1"]);
    expect(ids(filterBank(BANK, { text: "TAFKHEEM" }, TOPICS))).toEqual(["ra2"]);
    expect(ids(filterBank(BANK, { text: "nothing like this" }, TOPICS))).toEqual([]);
    expect(ids(filterBank(BANK, { text: "   " }, TOPICS))).toHaveLength(5);
  });

  it("matches Arabic regardless of composed or decomposed form", () => {
    const arabic = [q("ar", "sifaat", { prompt: "آية" })]; // آية, precomposed alif madda
    expect(ids(filterBank(arabic, { text: "آ" }, TOPICS))).toEqual(["ar"]); // alif + maddah above
  });

  it("combines every filter", () => {
    expect(ids(filterBank(BANK, { topicIds: ["sifaat"], kind: "short", marks: [2], unusedOnly: true }, TOPICS)))
      .toEqual(["ra2"]);
  });
});

describe("markValues", () => {
  it("lists the distinct mark values present, ascending, skipping blanks", () => {
    expect(markValues(BANK)).toEqual([1, 1.5, 2]);
  });
});

describe("topicCounts", () => {
  it("counts each leaf and rolls children up into the parent", () => {
    expect(topicCounts(BANK, TOPICS)).toEqual({
      "sifaat.ra": 2, "sifaat.hams": 1, sifaat: 3, "noon.iqlaab": 1, noon: 1, seerah: 1,
    });
  });
});
