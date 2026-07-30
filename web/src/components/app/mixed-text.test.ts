import { describe, it, expect } from "vitest";
import { splitRuns } from "./mixed-text";

describe("splitRuns", () => {
  it("pure Latin → single LTR run", () => {
    expect(splitRuns("What is Mad ul Asli otherwise known as?")).toEqual([
      { ar: false, text: "What is Mad ul Asli otherwise known as?" },
    ]);
  });

  it("pure Arabic → single RTL run", () => {
    expect(splitRuns("مد طبيعي")).toEqual([{ ar: true, text: "مد طبيعي" }]);
  });

  it("verse embedded in a Latin question (real HW 3 prompt shape)", () => {
    const runs = splitRuns("How many times does Idhaar occur in this verse? ٱلَّذِىٓ");
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual({
      ar: false,
      text: "How many times does Idhaar occur in this verse? ",
    });
    expect(runs[1].ar).toBe(true);
    expect(runs[1].text).toBe("ٱلَّذِىٓ");
  });

  it("multi-word verse stays ONE Arabic run (spaces don't split it)", () => {
    const runs = splitRuns("حَبًّا وَنَبَاتًا");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({ ar: true, text: "حَبًّا وَنَبَاتًا" });
  });

  it("mixed answer style: 'mad طبيعي/ original/natural' (real student answer)", () => {
    const runs = splitRuns("mad طبيعي/ original/natural");
    // mad → [ar]طبيعي → /original/natural ; slash after Arabic is Latin-run
    expect(runs.map((r) => r.ar)).toEqual([false, true, false]);
    expect(runs[1].text).toBe("طبيعي");
    expect(runs[2].text).toBe("/ original/natural");
  });

  it("alternating segments round-trip losslessly", () => {
    const s = "Rule: الإدغام means merging — القلقلة is echoing.";
    expect(splitRuns(s).map((r) => r.text).join("")).toBe(s);
  });

  it("harakat and shadda stay inside the Arabic run", () => {
    const runs = splitRuns("say بِسْمِ ٱللَّهِ loudly");
    expect(runs.map((r) => r.ar)).toEqual([false, true, false]);
    // rule: boundary whitespace attaches to the PRECEDING run (space is
    // bidi-neutral, renders identically either side of the isolate)
    expect(runs[1].text).toBe("بِسْمِ ٱللَّهِ ");
    expect(runs[2].text).toBe("loudly");
  });

  it("empty and whitespace-only input", () => {
    expect(splitRuns("")).toEqual([]);
    expect(splitRuns("   ")).toEqual([{ ar: false, text: "   " }]);
  });
});
