import { describe, it, expect } from "vitest";
import { parseMedia } from "./media";

const URL_6 = "https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/090006.mp3";
const URL_5 = "https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/047005.mp3";

describe("parseMedia: the good shapes", () => {
  it("reads a clip with its slice and label", () => {
    expect(
      parseMedia({
        clip: { url: URL_6, start_ms: 3590, end_ms: 6200, label: "Al-Balad 90:6" },
      }),
    ).toEqual({
      clip: { url: URL_6, startMs: 3590, endMs: 6200, label: "Al-Balad 90:6" },
      optionAudio: {},
    });
  });

  it("reads option audio keyed by position, whole file or slice", () => {
    const m = parseMedia({
      option_audio: {
        "1": { url: URL_5 },
        "2": { url: URL_6, start_ms: 0, end_ms: 4000 },
      },
    });
    expect(m.clip).toBeUndefined();
    expect(m.optionAudio).toEqual({
      1: { url: URL_5 },
      2: { url: URL_6, startMs: 0, endMs: 4000 },
    });
  });

  it("carries both keys together", () => {
    const m = parseMedia({
      clip: { url: URL_6, start_ms: 1, end_ms: 2 },
      option_audio: { "0": { url: URL_5 } },
    });
    expect(m.clip?.url).toBe(URL_6);
    expect(m.optionAudio[0]).toEqual({ url: URL_5 });
  });

  it("rounds fractional milliseconds rather than refusing them", () => {
    expect(parseMedia({ clip: { url: URL_6, start_ms: 11280.4, end_ms: 12490.6 } }).clip)
      .toEqual({ url: URL_6, startMs: 11280, endMs: 12491 });
  });

  it("drops a blank label but keeps the clip", () => {
    expect(parseMedia({ clip: { url: URL_6, start_ms: 0, end_ms: 10, label: "  " } }).clip)
      .toEqual({ url: URL_6, startMs: 0, endMs: 10 });
  });
});

describe("parseMedia: no media at all", () => {
  it.each([null, undefined])("%s is no media", (raw) => {
    expect(parseMedia(raw)).toEqual({ optionAudio: {} });
  });

  it("an empty object is no media", () => {
    expect(parseMedia({})).toEqual({ optionAudio: {} });
  });
});

describe("parseMedia: junk is ignored, never thrown", () => {
  it.each([
    ["a string", "https://x/1.mp3"],
    ["a number", 42],
    ["an array", [{ url: URL_6 }]],
    ["true", true],
  ])("%s at the top is no media", (_name, raw) => {
    expect(parseMedia(raw)).toEqual({ optionAudio: {} });
  });

  it.each([
    ["http", "http://mirrors.quranicaudio.com/everyayah/Husary_64kbps/090006.mp3"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:audio/mp3;base64,AAAA"],
    ["relative", "/audio/090006.mp3"],
    ["not a url", "not a url"],
    ["empty", ""],
  ])("refuses a clip whose url is %s", (_name, url) => {
    expect(parseMedia({ clip: { url, start_ms: 0, end_ms: 1000 } }).clip).toBeUndefined();
  });

  it.each([
    "https://mirrors.quranicaudio.com/everyayah/Husary_64kbps/090006.mp3",
    "https://download.quranicaudio.com/quran/mahmood_khaleel_al-husaree/090.mp3",
    "https://everyayah.com/data/Husary_64kbps/090006.mp3",
    "https://verses.quran.com/Husary/mp3/090006.mp3",
    "https://audio.qurancdn.com/Husary/mp3/090006.mp3",
    "https://EveryAyah.com/data/Husary_64kbps/090006.mp3",
    "https://audio-cdn.tarteel.ai/quran/surah/husary/murattal/mp3/090.mp3",
  ])("plays audio from a Qur'an audio host: %s", (url) => {
    expect(parseMedia({ clip: { url, start_ms: 0, end_ms: 1000 } }).clip?.url).toBe(url);
    expect(parseMedia({ option_audio: { "1": { url } } }).optionAudio[1]?.url).toBe(url);
  });

  it.each([
    ["any other host", "https://example.com/090006.mp3"],
    ["a lookalike suffix", "https://everyayah.com.evil.example/090006.mp3"],
    ["a lookalike prefix", "https://notmirrors.quranicaudio.com/x.mp3"],
    ["a subdomain not on the list", "https://cdn.everyayah.com/x.mp3"],
    ["credentials before the host", "https://everyayah.com@evil.example/x.mp3"],
    ["a port", "https://everyayah.com:8443/x.mp3"],
  ])("refuses %s", (_name, url) => {
    expect(parseMedia({ clip: { url, start_ms: 0, end_ms: 1000 } }).clip).toBeUndefined();
    expect(parseMedia({ option_audio: { "1": { url } } }).optionAudio).toEqual({});
  });

  it("refuses a url that is not a string", () => {
    expect(parseMedia({ clip: { url: 7, start_ms: 0, end_ms: 1000 } }).clip).toBeUndefined();
    expect(parseMedia({ clip: { start_ms: 0, end_ms: 1000 } }).clip).toBeUndefined();
  });

  it("refuses a listening clip with no slice: it is a slice by definition", () => {
    expect(parseMedia({ clip: { url: URL_6 } }).clip).toBeUndefined();
    expect(parseMedia({ clip: { url: URL_6, start_ms: 100 } }).clip).toBeUndefined();
    expect(parseMedia({ clip: { url: URL_6, end_ms: 100 } }).clip).toBeUndefined();
  });

  it("refuses negative times", () => {
    expect(parseMedia({ clip: { url: URL_6, start_ms: -1, end_ms: 100 } }).clip).toBeUndefined();
    expect(parseMedia({ clip: { url: URL_6, start_ms: -200, end_ms: -100 } }).clip).toBeUndefined();
  });

  it("refuses a slice that ends before, or as, it starts", () => {
    expect(parseMedia({ clip: { url: URL_6, start_ms: 6200, end_ms: 3590 } }).clip).toBeUndefined();
    expect(parseMedia({ clip: { url: URL_6, start_ms: 500, end_ms: 500 } }).clip).toBeUndefined();
  });

  it("refuses times that are not finite numbers", () => {
    expect(parseMedia({ clip: { url: URL_6, start_ms: "0", end_ms: "100" } }).clip).toBeUndefined();
    expect(parseMedia({ clip: { url: URL_6, start_ms: 0, end_ms: Infinity } }).clip).toBeUndefined();
    expect(parseMedia({ clip: { url: URL_6, start_ms: NaN, end_ms: 100 } }).clip).toBeUndefined();
  });

  it("drops a bad option entry and keeps the good ones", () => {
    const m = parseMedia({
      option_audio: {
        "1": { url: URL_5 },
        "2": { url: "http://insecure/2.mp3" },
        "3": { url: URL_6, start_ms: 4000, end_ms: 0 },
        "4": "https://not-an-object/4.mp3",
        "5": { url: URL_6, start_ms: 10 },
        x: { url: URL_6 },
        "-1": { url: URL_6 },
        "1.5": { url: URL_6 },
      },
    });
    expect(m.optionAudio).toEqual({ 1: { url: URL_5 } });
  });

  it("ignores option_audio that is not an object", () => {
    expect(parseMedia({ option_audio: [{ url: URL_5 }] }).optionAudio).toEqual({});
    expect(parseMedia({ option_audio: "x" }).optionAudio).toEqual({});
  });

  it("a bad clip leaves good option audio standing, and the reverse", () => {
    expect(
      parseMedia({ clip: { url: "http://x" }, option_audio: { "1": { url: URL_5 } } }),
    ).toEqual({ optionAudio: { 1: { url: URL_5 } } });
    expect(
      parseMedia({ clip: { url: URL_6, start_ms: 0, end_ms: 9 }, option_audio: 3 }),
    ).toEqual({ clip: { url: URL_6, startMs: 0, endMs: 9 }, optionAudio: {} });
  });
});
