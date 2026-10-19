import { describe, expect, it } from "vitest";
import { resourceHomework } from "./resource-homework";

const hw = (id: string, course_id: string | null, number: number) => ({ id, course_id, number });

const ummAlKitab = "umm";
const rows = [
  hw("h202", ummAlKitab, 202),
  hw("h201", ummAlKitab, 201),
  hw("h7", "ghunna", 7),
  hw("hx", null, 99),
];

describe("resourceHomework", () => {
  it("is the homework of the class's Resources courses, in number order", () => {
    expect(resourceHomework(rows, [ummAlKitab], new Set()).map((h) => h.id)).toEqual(["h201", "h202"]);
  });

  it("leaves out an item the teacher put into one of the class's weeks", () => {
    expect(resourceHomework(rows, [ummAlKitab], new Set(["h202"])).map((h) => h.id)).toEqual(["h201"]);
  });

  it("is empty for a class with no Resources", () => {
    expect(resourceHomework(rows, [], new Set())).toEqual([]);
  });
});
