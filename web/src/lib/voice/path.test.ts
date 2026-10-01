import { describe, expect, it } from "vitest";
import { isOwnVoicePath, submissionIdFromPath, voiceObjectPath } from "./path";

describe("voiceObjectPath", () => {
  it("puts the owner first, then the submission, then the attempt", () => {
    expect(voiceObjectPath("u1", "s1", 1, "q1", "webm")).toBe("u1/s1/a1/q1.webm");
  });

  it("gives a redo its own folder so the marked attempt's audio survives", () => {
    expect(voiceObjectPath("u1", "s1", 2, "q1", "m4a")).toBe("u1/s1/a2/q1.m4a");
  });
});

describe("submissionIdFromPath", () => {
  it("reads the submission out of a current path", () => {
    expect(submissionIdFromPath("u1/s1/a1/q1.webm")).toBe("s1");
  });

  /* The one recording made before the attempt folder existed keeps its path,
     and storage RLS reads the same segment on both shapes. */
  it("reads it out of a legacy path with no attempt folder", () => {
    expect(submissionIdFromPath("u1/s1/q1.webm")).toBe("s1");
  });

  it("reports nothing for a path that isn't one of ours", () => {
    expect(submissionIdFromPath("avatars/u1.png")).toBeNull();
    expect(submissionIdFromPath("u1/s1")).toBeNull();
    expect(submissionIdFromPath("")).toBeNull();
    expect(submissionIdFromPath("u1//q1.webm")).toBeNull();
  });
});

describe("isOwnVoicePath", () => {
  const mine = { uid: "u1", submissionId: "s1", attempt: 2, questionId: "q1" };

  it("accepts the path the recorder builds, in either format", () => {
    expect(isOwnVoicePath(voiceObjectPath("u1", "s1", 2, "q1", "webm"), mine)).toBe(true);
    expect(isOwnVoicePath(voiceObjectPath("u1", "s1", 2, "q1", "m4a"), mine)).toBe(true);
  });

  it("refuses another student's folder, submission, attempt or question", () => {
    expect(isOwnVoicePath("u2/s1/a2/q1.webm", mine)).toBe(false);
    expect(isOwnVoicePath("u1/s9/a2/q1.webm", mine)).toBe(false);
    expect(isOwnVoicePath("u1/s1/a1/q1.webm", mine)).toBe(false);
    expect(isOwnVoicePath("u1/s1/a2/q9.webm", mine)).toBe(false);
  });

  it("refuses anything that is not exactly that shape", () => {
    expect(isOwnVoicePath("", mine)).toBe(false);
    expect(isOwnVoicePath("u1/s1/a2/q1", mine)).toBe(false);
    expect(isOwnVoicePath("u1/s1/a2/q1.webm/../../u2/x.webm", mine)).toBe(false);
    expect(isOwnVoicePath("u1/s1/a2/q1.we bm", mine)).toBe(false);
    expect(isOwnVoicePath("u1/s1/q1.webm", mine)).toBe(false);   // legacy: not a new write
  });
});
