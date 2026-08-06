import { describe, expect, it } from "vitest";
import { parseYouTubeId, thumbnailUrl } from "./youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeId", () => {
  it("passes a bare 11-character id straight through", () => {
    expect(parseYouTubeId(ID)).toBe(ID);
  });

  it.each([
    ["watch url", `https://www.youtube.com/watch?v=${ID}`],
    ["watch url without www", `https://youtube.com/watch?v=${ID}`],
    ["short share url", `https://youtu.be/${ID}`],
    ["embed url", `https://www.youtube.com/embed/${ID}`],
    ["live url", `https://www.youtube.com/live/${ID}`],
    ["shorts url", `https://www.youtube.com/shorts/${ID}`],
    ["http, not https", `http://www.youtube.com/watch?v=${ID}`],
    ["no scheme at all", `youtube.com/watch?v=${ID}`],
  ])("extracts the id from a %s", (_label, url) => {
    expect(parseYouTubeId(url)).toBe(ID);
  });

  it.each([
    ["a timestamp", `https://youtu.be/${ID}?t=42`],
    ["a playlist", `https://www.youtube.com/watch?v=${ID}&list=PLabc123&index=2`],
    ["a leading param", `https://www.youtube.com/watch?app=desktop&v=${ID}`],
  ])("ignores %s", (_label, url) => {
    expect(parseYouTubeId(url)).toBe(ID);
  });

  it("trims surrounding whitespace from a paste", () => {
    expect(parseYouTubeId(`  https://youtu.be/${ID}  `)).toBe(ID);
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["not a youtube link", "https://vimeo.com/123456789"],
    ["a youtube link with no video", "https://www.youtube.com/@somechannel"],
    ["too short to be an id", "abc123"],
    ["an id with illegal characters", "dQw4w9WgX!Q"],
  ])("returns null for %s", (_label, input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });
});

describe("thumbnailUrl", () => {
  it("builds the hqdefault url for an id", () => {
    expect(thumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });

  it("returns null when there is no video", () => {
    expect(thumbnailUrl(null)).toBeNull();
  });

  it("returns null for an empty string rather than a broken url", () => {
    expect(thumbnailUrl("")).toBeNull();
  });
});
