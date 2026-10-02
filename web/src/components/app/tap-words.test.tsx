// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { TapWords } from "./tap-words";

afterEach(cleanup);

const opt = (position: number, label: string, value: string) => ({ position, label, value });
// Al-Fajr 89:1–2 as printed on page 593: line 2 holds 89:1 and the first word of 89:2.
const LINED = [
  opt(1, "89:1:1:593:2", "ﭑ\tوَٱلْفَجْرِ\tﭒ"),
  opt(2, "89:2:1:593:2", "ﭓ\tوَلَيَالٍ"),
  opt(3, "89:2:2:593:3", "ﭔ\tعَشْرٍۢ\tﭕ"),
  opt(4, "89:3:1:593:3", "ﭖ\tوَٱلشَّفْعِ"),
  opt(5, "89:3:2:593:3", "ﭗ\tوَٱلْوَتْرِ\tﭘ"),
];

describe("TapWords: the mushaf's own lines", () => {
  it("sets each printed line as its own row, in that page's font", () => {
    const { container } = render(<TapWords options={LINED} selected={[]} onChange={() => {}} />);
    const rows = container.querySelectorAll(".qcf-line");
    expect(rows).toHaveLength(2);
    expect((rows[0] as HTMLElement).style.fontFamily).toContain("QCF_P593");
    expect(rows[0].querySelectorAll("button")).toHaveLength(2);
    expect(rows[1].querySelectorAll("button")).toHaveLength(3);
  });

  it("closes each ayah with its printed end marker, which is not tappable", () => {
    const { container, getAllByLabelText } = render(<TapWords options={LINED} selected={[]} onChange={() => {}} />);
    const ends = container.querySelectorAll(".tap-end");
    expect([...ends].map((e) => e.textContent)).toEqual(["ﭒ", "ﭕ", "ﭘ"]);
    expect(getAllByLabelText(/^ayah \d+$/)).toHaveLength(3);
    for (const e of ends) expect(e.closest("button")).toBeNull();
  });

  it("still toggles a word by its option position", () => {
    let picked: number[] = [];
    const { getByRole } = render(<TapWords options={LINED} selected={[]} onChange={(n) => (picked = n)} />);
    fireEvent.click(getByRole("button", { name: "عَشْرٍۢ" }));
    expect(picked).toEqual([3]);
  });

  it("keeps the flowing layout for a passage built before lines were recorded", () => {
    const old = LINED.map((o) => ({ ...o, label: o.label.split(":").slice(0, 4).join(":") }));
    const { container } = render(<TapWords options={old} selected={[]} onChange={() => {}} />);
    expect(container.querySelectorAll(".qcf-line")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(5);
  });
});
