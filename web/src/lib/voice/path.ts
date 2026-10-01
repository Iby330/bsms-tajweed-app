/**
 * Where a recitation lives in the private `voice-notes` bucket.
 *
 * Storage RLS reads the path rather than a table: segment 1 is the owner's
 * user id and segment 2 the submission, which has to be that student's draft.
 * The attempt folder arrived with redos — without it a re-recorded answer
 * would overwrite the audio the teacher marked on the previous attempt.
 */
export function voiceObjectPath(
  uid: string,
  submissionId: string,
  attempt: number,
  questionId: string,
  extension: string,
): string {
  return `${uid}/${submissionId}/a${attempt}/${questionId}.${extension}`;
}

/**
 * The submission a stored object belongs to, or null when the path is not one
 * of ours. The attempt folder went *after* the submission precisely so this
 * segment means the same on a legacy `uid/submission/question.ext` path as on
 * a current one — the policies in the database rely on that too.
 */
export function submissionIdFromPath(path: string): string | null {
  const segments = path.split("/");
  return segments.length >= 3 && segments[1] !== "" ? segments[1] : null;
}

/**
 * Is `path` exactly where this caller's recording for this question, on this
 * attempt, belongs? The server checks a client-supplied path with this before
 * pointing a submission at it: storage RLS guards the audio, but nothing else
 * stopped a crafted call recording someone else's folder as this answer.
 * Only the extension is free, and only as a short alphanumeric one.
 */
export function isOwnVoicePath(
  path: string,
  own: { uid: string; submissionId: string; attempt: number; questionId: string },
): boolean {
  const prefix = voiceObjectPath(own.uid, own.submissionId, own.attempt, own.questionId, "");
  return path.startsWith(prefix) && /^[a-z0-9]{1,5}$/.test(path.slice(prefix.length));
}
