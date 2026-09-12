import { describe, expect, it } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { readPalette } from "./palette";
import { CREAM } from "./cream";

const CSS = resolve(__dirname, "../../app/globals.css");

/**
 * The cream scheme, pinned.
 *
 * The brief when navy was proposed was explicit: if we ever go back, the app
 * has to look EXACTLY as it did on 12 September 2026 — not approximately, and
 * not rebuilt from a description. That is only true for as long as nobody
 * edits a cream value, and nothing else in the codebase would notice if
 * somebody did. A hex is a hex; it renders either way.
 *
 * So this holds all 107 of them. Navy lives in `:root[data-brand="navy"]`
 * blocks, which this deliberately does not read — the reverted state is
 * whatever the BARE `:root` and `.dark` blocks say, and those must not move.
 *
 * If this test fails, the question is not "how do I update the snapshot".
 * It is "who changed a cream colour, and did they mean to". Regenerating
 * cream.ts to make it pass throws away the only guarantee there is.
 */
describe("the cream scheme", () => {
  const live = readPalette(CSS);

  it("still has every light token, unchanged", () => {
    expect(live.light).toEqual(CREAM.light);
  });

  it("still has every dark token, unchanged", () => {
    expect(live.dark).toEqual(CREAM.dark);
  });

  it("covers the whole scheme, not just the main palette", () => {
    // All five blocks: the two palettes, the two glass/glow sets, and the
    // class-photo grade. Losing one silently would make this pass while half
    // the scheme drifted.
    for (const token of ["--background", "--foreground", "--ok", "--danger",
                         "--glass-bg", "--glow-1", "--viz-exam",
                         "--photo-op", "--photo-filter", "--sidebar"]) {
      expect(live.light[token], `light ${token}`).toBeDefined();
      expect(live.dark[token], `dark ${token}`).toBeDefined();
    }
  });

  it("reads nothing from a branded block", () => {
    // The guarantee rests on navy being additive. If a navy value ever showed
    // up here it would mean the override had been written onto the cream
    // selector instead of beside it.
    const css = `
      :root { --a: cream-light; }
      .dark { --a: cream-dark; }
      :root[data-brand="navy"] { --a: navy-light; }
      :root[data-brand="navy"].dark { --a: navy-dark; }
    `;
    const tmp = resolve(__dirname, "__brand-fixture.css");
    writeFileSync(tmp, css);
    try {
      const p = readPalette(tmp);
      expect(p.light["--a"]).toBe("cream-light");
      expect(p.dark["--a"]).toBe("cream-dark");
    } finally {
      unlinkSync(tmp);
    }
  });
});
