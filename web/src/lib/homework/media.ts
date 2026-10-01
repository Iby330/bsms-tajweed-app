/**
 * The audio a question carries: `questions.media`, jsonb (migration 0039).
 *
 *   {"clip":         {"url": "https://…/090006.mp3", "start_ms": 3590, "end_ms": 6200,
 *                     "label": "Al-Balad 90:6"},
 *    "option_audio": {"1": {"url": "https://…/047005.mp3"},
 *                     "2": {"url": "…", "start_ms": 0, "end_ms": 4000}}}
 *
 * `clip` is the "name the rule you heard" listening: a slice of one ayah's
 * recitation, played between the prompt and the options. `option_audio` puts
 * a play button on an option, keyed by the option's `position`, for a question
 * whose options are ayahs.
 *
 * Nothing in the database checks this shape — it is authored by hand, a row
 * at a time — so it is read here, once, and anything that is not what it
 * should be is DROPPED rather than thrown on. A clip with a typo in it must
 * cost that one question its audio, never the student their whole homework
 * page. The same posture as parseSnapshotAnswers in past-attempts.
 *
 * Pure, no IO: the URL is checked for shape, not fetched.
 */

/** A recording to play: the whole file, or the slice [startMs, endMs). */
export type Clip = {
  url: string;
  startMs?: number;
  endMs?: number;
  /** Where the audio is from, e.g. "Al-Balad 90:6". Shown under the button. */
  label?: string;
};

export type QuestionMedia = {
  clip?: Clip;
  /** option position → its recording. Empty when the options carry none. */
  optionAudio: Record<number, Clip>;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * https and nothing else. The URL ends up as an <audio> src on a student's
 * page, so `javascript:` and `data:` are out on principle, and plain http is
 * out because the site is served over https and a browser blocks (or warns
 * about) mixed-content audio — a clip that silently never plays.
 */
function httpsUrl(v: unknown): string | null {
  if (typeof v !== "string" || v === "") return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

function ms(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

/**
 * One recording. `requireSlice` is the listening clip's rule: it exists to
 * play two or three words out of an ayah, so a clip without both times would
 * play the whole ayah and hand the student the context the question is
 * testing them without. An option's audio may be the whole file — but if it
 * names one end of a slice it must name both, because guessing the other end
 * plays something the teacher did not choose.
 */
function parseClip(raw: unknown, requireSlice: boolean): Clip | null {
  if (!isObject(raw)) return null;
  const url = httpsUrl(raw.url);
  if (!url) return null;

  const hasStart = raw.start_ms !== undefined;
  const hasEnd = raw.end_ms !== undefined;
  const clip: Clip = { url };

  if (hasStart || hasEnd || requireSlice) {
    const start = ms(raw.start_ms);
    const end = ms(raw.end_ms);
    // A slice that ends where it starts plays nothing, and one that runs
    // backwards cannot be played at all.
    if (start === null || end === null || end <= start) return null;
    clip.startMs = start;
    clip.endMs = end;
  }

  if (typeof raw.label === "string" && raw.label.trim()) clip.label = raw.label.trim();
  return clip;
}

export function parseMedia(raw: unknown): QuestionMedia {
  const out: QuestionMedia = { optionAudio: {} };
  if (!isObject(raw)) return out;

  const clip = parseClip(raw.clip, true);
  if (clip) out.clip = clip;

  if (isObject(raw.option_audio)) {
    for (const [key, value] of Object.entries(raw.option_audio)) {
      // jsonb object keys are always strings; a position is a whole number.
      const position = Number(key);
      if (key.trim() === "" || !Number.isInteger(position) || position < 0) continue;
      const audio = parseClip(value, false);
      if (audio) out.optionAudio[position] = audio;
    }
  }

  return out;
}
