import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Read the palette back out of globals.css.
 *
 * The point of this is the snapshot test beside it. The cream scheme is the
 * app's identity as it stood on 12 September 2026, and the brief when navy
 * went in was that reverting must land back on it EXACTLY — not
 * approximately, and not reconstructed from a note in a commit message.
 *
 * So the cream declarations are never edited. Navy is layered on top through
 * `:root[data-brand="navy"]`, and this reads only the blocks whose selector
 * is bare `:root` or `.dark` — a navy block cannot be mistaken for a cream
 * one, because its selector carries the attribute.
 *
 * Blocks are found by SELECTOR, not by line number, precisely so that adding
 * navy above or below them cannot quietly change what is being checked.
 */

export type Scheme = "light" | "dark";

/** Every `--token: value` in the file's bare `:root` / `.dark` blocks, merged
 *  in source order the way the cascade would merge them. */
export function readPalette(cssPath?: string): Record<Scheme, Record<string, string>> {
  const file = cssPath ?? resolve(process.cwd(), "src/app/globals.css");
  // Comments go first. Two blocks open straight after one, so anchoring on
  // the previous `}` alone misses them — and a `{` inside prose would be
  // read as a rule.
  const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

  const out: Record<Scheme, Record<string, string>> = { light: {}, dark: {} };

  // Leaf blocks only: a selector with no brace in it, then a body with no
  // brace in it. Nesting falls out for free — given `@layer x { .y { … } }`
  // the outer body contains a brace, so the match backtracks to `.y` and the
  // wrapper is skipped rather than mis-read as a selector.
  //
  // Nothing may be consumed BEFORE the selector: two of these blocks sit
  // directly against each other, and an anchor character would be eaten by
  // the first match and then missing for the second.
  const block = /([^{}]+?)\{([^{}]*)\}/g;
  for (let m = block.exec(css); m; m = block.exec(css)) {
    const selector = m[1].trim();
    const scheme: Scheme | null =
      selector === ":root" ? "light" : selector === ".dark" ? "dark" : null;
    if (!scheme) continue;

    for (const decl of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out[scheme][decl[1]] = decl[2].trim();
    }
  }
  return out;
}
