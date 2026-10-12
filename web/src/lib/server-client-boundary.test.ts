import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

/**
 * A server component may RENDER a component from a "use client" file, but it
 * cannot CALL a plain function from one: on the server every export of a
 * client file is a reference, and calling it throws during the render. Unit
 * tests render without that split, so they pass while production shows the
 * error page — which is how every paper sent back for a redo came to open on
 * "Something went wrong" (past-attempts called isInteractive from
 * interactive-answer). This walks the source and fails on any server file
 * importing a non-component (lower-case) name from a client file.
 */
const SRC = resolve(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

const isClient = (src: string) => /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) if (existsSync(base + ext)) return base + ext;
  return null;
}

describe("server files never call functions from client files", () => {
  it("imports only components (capitalised) or types from a 'use client' file", () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      const src = readFileSync(file, "utf8");
      if (isClient(src)) continue;
      for (const m of src.matchAll(/^import\s+(?!type\b)\{([^}]+)\}\s+from\s+["']([^"']+)["']/gm)) {
        const target = resolveImport(file, m[2]);
        if (!target || !isClient(readFileSync(target, "utf8"))) continue;
        const names = m[1].split(",").map((n) => n.trim()).filter((n) => n && !n.startsWith("type "));
        const calls = names.filter((n) => /^[a-z]/.test(n.split(/\s+as\s+/)[0]));
        if (calls.length) offenders.push(`${file.slice(SRC.length + 1)} ← ${m[2]}: ${calls.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
