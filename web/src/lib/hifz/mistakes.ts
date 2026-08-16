import { wordKey } from "@/lib/quran/mushaf";
import { detailLabel, flagLabel, type Category } from "./mistake-taxonomy";

export type MistakeRow = {
  id: string;
  session_id: string;
  surah_number: number;
  ayah_number: number;
  word_position: number;
  category: Category;
  detail: string | null;
  note: string | null;
  created_at: string;
};

export type SessionRow = {
  id: string;
  submitted_at: string | null;
  flags: string[];
  overall_note: string | null;
};

const RECENT_MS = 28 * 24 * 60 * 60 * 1000;
const isRecent = (createdAt: string, now: Date) =>
  now.getTime() - new Date(createdAt).getTime() <= RECENT_MS;

export type Pattern = {
  category: Category;
  detail: string | null;
  label: string;
  total: number;
  recent: number;      // last 28 days
  surahs: number[];    // distinct, first-seen order
  lastSeen: string;
};

/** Mistakes → recurring patterns ("Tajweed — Ikhfa · 7× across 3 surahs"),
 *  most recently active first. */
export function aggregatePatterns(mistakes: MistakeRow[], now: Date): Pattern[] {
  const byKey = new Map<string, Pattern>();
  for (const m of mistakes) {
    const key = `${m.category}|${m.detail ?? ""}`;
    let p = byKey.get(key);
    if (!p) {
      p = {
        category: m.category, detail: m.detail, label: detailLabel(m.category, m.detail),
        total: 0, recent: 0, surahs: [], lastSeen: m.created_at,
      };
      byKey.set(key, p);
    }
    p.total += 1;
    if (isRecent(m.created_at, now)) p.recent += 1;
    if (!p.surahs.includes(m.surah_number)) p.surahs.push(m.surah_number);
    if (m.created_at > p.lastSeen) p.lastSeen = m.created_at;
  }
  return [...byKey.values()].sort(
    (a, b) => b.recent - a.recent || b.total - a.total || b.lastSeen.localeCompare(a.lastSeen),
  );
}

export type FlagPattern = { flag: string; label: string; count: number; ofLast: number };

/** Session flags over the last (up to) five submitted sessions —
 *  "weak hifz in 3 of last 5". */
export function aggregateFlags(sessions: SessionRow[]): FlagPattern[] {
  const submitted = sessions
    .filter((s) => s.submitted_at)
    .sort((a, b) => b.submitted_at!.localeCompare(a.submitted_at!))
    .slice(0, 5);
  const counts = new Map<string, number>();
  for (const s of submitted) for (const f of s.flags) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts.entries()]
    .map(([flag, count]) => ({ flag, label: flagLabel(flag), count, ofLast: submitted.length }))
    .sort((a, b) => b.count - a.count);
}

/** Per-word heat: 2 per mistake in the last 28 days, 1 for older ones. */
export function wordHeat(mistakes: MistakeRow[], now: Date): Record<string, number> {
  const heat: Record<string, number> = {};
  for (const m of mistakes) {
    const key = wordKey({ surah: m.surah_number, ayah: m.ayah_number, position: m.word_position });
    heat[key] = (heat[key] ?? 0) + (isRecent(m.created_at, now) ? 2 : 1);
  }
  return heat;
}

/** Tint for a heat value; empty when cold. Thresholds are presentation. */
export function heatClass(intensity: number): string {
  if (intensity <= 0) return "";
  if (intensity <= 2) return "bg-warn/20";
  if (intensity <= 4) return "bg-warn/40";
  return "bg-danger/40";
}
