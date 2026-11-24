/**
 * The workspace's optimistic edits, as pure functions over its client state.
 * Each mirrors what the matching server action does to the rows (positions
 * rewritten 1..n after every move), so the screen shows the result at once
 * and the action's reply has nothing to correct.
 */
import type { PaperItemWithImages } from "@/lib/exam-builder/queries";
import type { Paper, Practical, Section, SectionKind } from "@/lib/exam-builder/types";
import { placed } from "@/lib/exam-builder/validate";

export type Item = PaperItemWithImages;
export type PaperState = { paper: Paper; sections: Section[]; items: Item[] };

/** What the paper canvas can ask the workspace to do. Each updates the screen at once. */
export type PaperOps = {
  editHeader: () => void;
  renameSection: (id: string, title: string) => void;
  updatePractical: (id: string, practical: Practical) => void;
  moveSection: (id: string, dir: "up" | "down") => void;
  removeSection: (id: string) => void;
  addSection: (kind: SectionKind) => void;
  /** Open the "Add a question" drawer for this section. */
  openAdd: (sectionId: string) => void;
  editItem: (id: string) => void;
  moveItem: (id: string, dir: "up" | "down") => void;
  /** Put a question at index `to` (0-based) in its own section: where a drag dropped it. */
  placeItem: (id: string, to: number) => void;
  moveItemToSection: (id: string, sectionId: string) => void;
  removeItem: (id: string) => void;
};

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

/** The section's items in order. */
export function itemsIn(items: Item[], sectionId: string): Item[] {
  return items.filter((i) => i.section_id === sectionId).sort(byPosition);
}

/** Sections in order. */
export function orderedSections(sections: Section[]): Section[] {
  return [...sections].sort(byPosition);
}

/** Rewrite a section's item positions to 1..n in their current order. */
function closeUp(items: Item[], sectionId: string): Item[] {
  const order = new Map(itemsIn(items, sectionId).map((i, n) => [i.id, n + 1]));
  return items.map((i) => (order.has(i.id) ? { ...i, position: order.get(i.id)! } : i));
}

function swap<T extends { id: string; position: number }>(list: T[], id: string, dir: "up" | "down"): Map<string, number> | null {
  const sorted = [...list].sort(byPosition);
  const i = sorted.findIndex((r) => r.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sorted.length) return null;
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  return new Map(sorted.map((r, n) => [r.id, n + 1]));
}

export function moveItemLocal(s: PaperState, id: string, dir: "up" | "down"): PaperState {
  const item = s.items.find((i) => i.id === id);
  if (!item) return s;
  const order = swap(itemsIn(s.items, item.section_id), id, dir);
  if (!order) return s;
  return { ...s, items: s.items.map((i) => (order.has(i.id) ? { ...i, position: order.get(i.id)! } : i)) };
}

export function placeItemLocal(s: PaperState, id: string, to: number): PaperState {
  const item = s.items.find((i) => i.id === id);
  if (!item) return s;
  const order = placed(itemsIn(s.items, item.section_id), id, to);
  if (!order) return s;
  const pos = new Map(order.map((r, n) => [r.id, n + 1]));
  return { ...s, items: s.items.map((i) => (pos.has(i.id) ? { ...i, position: pos.get(i.id)! } : i)) };
}

export function moveItemToSectionLocal(s: PaperState, id: string, sectionId: string): PaperState {
  const item = s.items.find((i) => i.id === id);
  if (!item || item.section_id === sectionId) return s;
  const end = itemsIn(s.items, sectionId).reduce((m, i) => Math.max(m, i.position), 0) + 1;
  const items = s.items.map((i) => (i.id === id ? { ...i, section_id: sectionId, position: end } : i));
  return { ...s, items: closeUp(items, item.section_id) };
}

export function removeItemLocal(s: PaperState, id: string): PaperState {
  const item = s.items.find((i) => i.id === id);
  if (!item) return s;
  return { ...s, items: closeUp(s.items.filter((i) => i.id !== id), item.section_id) };
}

export function updateItemLocal(s: PaperState, id: string, patch: Partial<Item>): PaperState {
  return { ...s, items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) };
}

/** Put a question at the end of its section (an add, or a placeholder for one). */
export function appendItemLocal(s: PaperState, item: Item): PaperState {
  const end = itemsIn(s.items, item.section_id).reduce((m, i) => Math.max(m, i.position), 0) + 1;
  return { ...s, items: [...s.items, { ...item, position: end }] };
}

/** Swap a placeholder for the row the server made, keeping its place. */
export function replaceItemLocal(s: PaperState, tempId: string, item: Item): PaperState {
  const temp = s.items.find((i) => i.id === tempId);
  if (!temp) return appendItemLocal(s, item);
  return { ...s, items: s.items.map((i) => (i.id === tempId ? { ...item, position: temp.position } : i)) };
}

export function moveSectionLocal(s: PaperState, id: string, dir: "up" | "down"): PaperState {
  const order = swap(s.sections, id, dir);
  if (!order) return s;
  return { ...s, sections: s.sections.map((x) => (order.has(x.id) ? { ...x, position: order.get(x.id)! } : x)) };
}

export function removeSectionLocal(s: PaperState, id: string): PaperState {
  const rest = orderedSections(s.sections.filter((x) => x.id !== id)).map((x, n) => ({ ...x, position: n + 1 }));
  return { ...s, sections: rest, items: s.items.filter((i) => i.section_id !== id) };
}

export function updateSectionLocal(s: PaperState, id: string, patch: Partial<Section>): PaperState {
  return { ...s, sections: s.sections.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
}

export function addSectionLocal(s: PaperState, section: Section): PaperState {
  return { ...s, sections: [...s.sections, section] };
}

export function updatePaperLocal(s: PaperState, patch: Partial<Paper>): PaperState {
  return { ...s, paper: { ...s.paper, ...patch } };
}

/**
 * Another teacher's changes, fetched fresh (use-paper-pulse): the server's
 * paper replaces the screen's, but a picture already on screen keeps its
 * signed URL, so it doesn't load again just because it was signed anew.
 */
export function adoptRemote(s: PaperState, fresh: PaperState): PaperState {
  const urls = new Map<string, string>();
  for (const i of s.items) for (const [path, url] of Object.entries(i.imageUrls)) urls.set(path, url);
  return {
    paper: fresh.paper,
    sections: fresh.sections,
    items: fresh.items.map((i) => ({
      ...i,
      imageUrls: Object.fromEntries(Object.entries(i.imageUrls).map(([path, url]) => [path, urls.get(path) ?? url])),
    })),
  };
}
