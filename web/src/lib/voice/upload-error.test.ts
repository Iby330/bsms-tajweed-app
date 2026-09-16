import { describe, expect, it } from "vitest";
import { uploadErrorMessage } from "./upload-error";

describe("uploadErrorMessage", () => {
  it("turns the bucket's size refusal into the limit a student can act on", () => {
    const readable = "That recording is too big — keep it under 25 MB.";
    expect(uploadErrorMessage("The object exceeded the maximum allowed size")).toBe(readable);
    expect(uploadErrorMessage("Payload too large")).toBe(readable);
    expect(uploadErrorMessage("413")).toBe(readable);
  });

  it("names the format when the bucket refuses the mime type", () => {
    const readable = "That recording format isn't accepted.";
    expect(uploadErrorMessage("mime type audio/ogg is not supported")).toBe(readable);
    expect(uploadErrorMessage("invalid_mime_type")).toBe(readable);
  });

  /* Anything else is left alone: a made-up sentence would hide what actually
     went wrong from whoever reads the report. */
  it("has nothing to say about an error it doesn't recognise", () => {
    expect(uploadErrorMessage("Failed to fetch")).toBeNull();
    expect(uploadErrorMessage("")).toBeNull();
  });
});
