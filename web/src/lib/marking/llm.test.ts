import { describe, it, expect, vi } from "vitest";
import {
  marksFromConcepts,
  parseModelReply,
  markFreeText,
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
