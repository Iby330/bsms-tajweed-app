import { describe, expect, it } from "vitest";
import { remarkItems, type RemarkRow } from "./remark";

const HW2 = { number: 2, series: "tajweed", title: "Ghunna" };
const HW1 = { number: 1, series: "tajweed", title: "Introduction" };
const names: Record<string, string> = { u1: "Zaid", u2: "Adam" };
const nameOf = (id: string) => names[id] ?? "";

const row = (over: Partial<RemarkRow>): RemarkRow => ({
  submission_id: "s1",
  student_id: "u1",
  position: 6,
  homework: HW2,
  ...over,
});

describe("remarkItems", () => {
  it("is empty when nothing needs marking", () => {
    expect(remarkItems([], nameOf)).toEqual([]);
  });

  it("groups a paper's questions into one item, in order", () => {
    const items = remarkItems([row({ position: 8 }), row({ position: 6 })], nameOf);
    expect(items).toHaveLength(1);
    expect(items[0].positions).toEqual([6, 8]);
  });

  it("orders by homework, then by student name", () => {
    const items = remarkItems(
      [
        row({ submission_id: "a", student_id: "u1" }),
        row({ submission_id: "b", student_id: "u2" }),
        row({ submission_id: "c", student_id: "u1", homework: HW1 }),
      ],
      nameOf,
    );
    expect(items.map((i) => i.submissionId)).toEqual(["c", "b", "a"]);
  });
});
