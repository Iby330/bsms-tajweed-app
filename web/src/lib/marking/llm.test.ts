import { describe, it, expect, vi } from "vitest";
import {
  marksFromConcepts,
  parseModelReply,
  markFreeText,
  markingModel,
  backoffMs,
  DEFAULT_MARKING_MODEL,
  MAX_BACKOFF_MS,
  MARKING_SYSTEM_PROMPT,
} from "./llm";
import type { RubricConcept } from "./objective";

const rubric: RubricConcept[] = [
  { id: "c1", desc: "Observing each letter with correct origin", marks: 1 },
  { id: "c2", desc: "And characteristics", marks: 1 },
];

const reply = (content: string) =>
  ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ choices: [{ message: { content } }] }),
  }) as unknown as Response;

describe("marksFromConcepts", () => {
  it("sums only the concepts the model marked present", () => {
    expect(marksFromConcepts(rubric, [
      { id: "c1", present: true },
      { id: "c2", present: false },
    ])).toBe(1);
  });
  it("full marks when every concept is present", () => {
    expect(marksFromConcepts(rubric, [
      { id: "c1", present: true },
      { id: "c2", present: true },
    ])).toBe(2);
  });
  it("weights unequal concepts correctly", () => {
    const r: RubricConcept[] = [
      { id: "a", desc: "", marks: 3 },
      { id: "b", desc: "", marks: 1 },
    ];
    expect(marksFromConcepts(r, [
      { id: "a", present: true },
      { id: "b", present: false },
    ])).toBe(3);
  });
  it("ignores concepts the model invented", () => {
    expect(marksFromConcepts(rubric, [{ id: "not-a-concept", present: true }])).toBe(0);
  });
});

describe("parseModelReply", () => {
  it("parses clean JSON", () => {
    const out = parseModelReply(
      '{"concepts":[{"id":"c1","present":true,"why":"named it"},{"id":"c2","present":false}]}',
      rubric,
    );
    expect(out).toEqual([
      { id: "c1", present: true, why: "named it" },
      { id: "c2", present: false },
    ]);
  });
  it("salvages JSON wrapped in prose", () => {
    const out = parseModelReply(
      'Here you go: {"concepts":[{"id":"c1","present":true}]} — done',
      rubric,
    );
    expect(out?.[0]).toEqual({ id: "c1", present: true });
  });
  it("treats a concept the model omitted as absent", () => {
    const out = parseModelReply('{"concepts":[{"id":"c1","present":true}]}', rubric);
    expect(out).toHaveLength(2);
    expect(out?.[1]).toEqual({ id: "c2", present: false, why: "not addressed" });
  });
  it("coerces non-boolean present to false", () => {
    const out = parseModelReply('{"concepts":[{"id":"c1","present":"yes"}]}', rubric);
    expect(out?.[0].present).toBe(false);
  });
  it("returns null for unparseable or empty output", () => {
    expect(parseModelReply("not json at all", rubric)).toBeNull();
    expect(parseModelReply('{"concepts":[]}', rubric)).toBeNull();
    expect(parseModelReply('{"wrong":"shape"}', rubric)).toBeNull();
  });
});

describe("markFreeText", () => {
  const opts = { apiKey: "test-key", sleep: async () => {} };

  it("marks a correct answer and sums in code", async () => {
    const fetchMock = vi.fn(async () =>
      reply('{"concepts":[{"id":"c1","present":true},{"id":"c2","present":true}]}'),
    );
    const out = await markFreeText(
      { prompt: "What is the technical definition of Tajweed?", rubric, answer: "مد طبيعي" },
      { ...opts, fetch: fetchMock as unknown as typeof fetch },
    );
    expect(out?.marks).toBe(2);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends the verified system prompt and never the student's identity", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: unknown) =>
      reply('{"concepts":[{"id":"c1","present":true}]}'));
    await markFreeText(
      { prompt: "Q", rubric, answer: "A" },
      { ...opts, fetch: fetchMock as unknown as typeof fetch },
    );
    const init = fetchMock.mock.calls[0]?.[1] as unknown as { body: string };
    const body = JSON.parse(init.body);
    expect(body.messages[0].content).toBe(MARKING_SYSTEM_PROMPT);
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: "json_object" });
    const sent = JSON.stringify(body);
    expect(sent).not.toMatch(/student_id|email|full_name/);
  });

  it("short-circuits a blank answer without calling the API", async () => {
    const fetchMock = vi.fn();
    const out = await markFreeText(
      { prompt: "Q", rubric, answer: "   " },
      { ...opts, fetch: fetchMock as unknown as typeof fetch },
    );
    expect(out?.marks).toBe(0);
    expect(out?.model).toBe("none");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false, status: 429, headers: { get: () => null },
      } as unknown as Response)
      .mockResolvedValueOnce(reply('{"concepts":[{"id":"c1","present":true}]}'));
    const out = await markFreeText(
      { prompt: "Q", rubric, answer: "A" },
      { ...opts, fetch: fetchMock as unknown as typeof fetch },
    );
    expect(out?.marks).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated rate limits → manual queue", async () => {
    const fetchMock = vi.fn(async () =>
      ({ ok: false, status: 429, headers: { get: () => null } }) as unknown as Response,
    );
    const out = await markFreeText(
      { prompt: "Q", rubric, answer: "A" },
      { ...opts, fetch: fetchMock as unknown as typeof fetch },
    );
    expect(out).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns null when the reply never parses", async () => {
    const fetchMock = vi.fn(async () => reply("gibberish"));
    const out = await markFreeText(
      { prompt: "Q", rubric, answer: "A" },
      { ...opts, fetch: fetchMock as unknown as typeof fetch },
    );
    expect(out).toBeNull();
  });

  it("returns null for an empty rubric rather than guessing", async () => {
    const fetchMock = vi.fn();
    const out = await markFreeText(
      { prompt: "Q", rubric: [], answer: "A" },
      { ...opts, fetch: fetchMock as unknown as typeof fetch },
    );
    expect(out).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("survives a network throw", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const out = await markFreeText(
      { prompt: "Q", rubric, answer: "A" },
      { ...opts, fetch: fetchMock as unknown as typeof fetch },
    );
    expect(out).toBeNull();
  });
});

describe("markingModel", () => {
  it("defaults to a model Groq still serves, and an env var overrides it", () => {
    vi.stubEnv("MARKING_MODEL", "");
    expect(markingModel()).toBe(DEFAULT_MARKING_MODEL);
    vi.stubEnv("MARKING_MODEL", "qwen/qwen3.8-27b");
    expect(markingModel()).toBe("qwen/qwen3.8-27b");
    vi.unstubAllEnvs();
  });
});

describe("backoffMs", () => {
  it("doubles from 800ms when no Retry-After is given", () => {
    expect(backoffMs(1, 0)).toBe(800);
    expect(backoffMs(2, 0)).toBe(1600);
  });
  it("never waits longer than the cap, however long Retry-After asks for", () => {
    expect(backoffMs(1, 60)).toBe(MAX_BACKOFF_MS);
    expect(backoffMs(5, 0)).toBe(MAX_BACKOFF_MS);
    expect(backoffMs(1, 1)).toBe(1000);
  });
});

describe("markFreeText request and failures", () => {
  const opts = { apiKey: "test-key", sleep: async () => {} };

  it("asks gpt-oss for low reasoning effort and room to answer after reasoning", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: unknown) =>
      reply('{"concepts":[{"id":"c1","present":true}]}'));
    await markFreeText(
      { prompt: "Q", rubric, answer: "A", model: "openai/gpt-oss-120b" },
      { ...opts, fetch: fetchMock as unknown as typeof fetch },
    );
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as { body: string }).body);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.reasoning_effort).toBe("low");
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(1000);
  });

  it("logs the status and model once when the model is gone (404)", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () =>
      ({ ok: false, status: 404, headers: { get: () => null } }) as unknown as Response);
    const out = await markFreeText(
      { prompt: "Q", rubric, answer: "A", model: "gone-model" },
      { ...opts, fetch: fetchMock as unknown as typeof fetch },
    );
    expect(out).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(err).toHaveBeenCalledOnce();
    expect(String(err.mock.calls[0]?.[0])).toMatch(/404.*gone-model/);
    err.mockRestore();
  });

  it("caps each 429 wait even when Retry-After asks for a minute", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const waits: number[] = [];
    const fetchMock = vi.fn(async () =>
      ({ ok: false, status: 429, headers: { get: () => "60" } }) as unknown as Response);
    const out = await markFreeText(
      { prompt: "Q", rubric, answer: "A" },
      { apiKey: "k", sleep: async (ms: number) => { waits.push(ms); }, fetch: fetchMock as unknown as typeof fetch },
    );
    expect(out).toBeNull();
    expect(waits.every((w) => w <= MAX_BACKOFF_MS)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    err.mockRestore();
  });
});
