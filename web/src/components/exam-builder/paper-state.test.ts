import { describe, expect, it } from "vitest";
import { adoptRemote, type Item, type PaperState } from "./paper-state";

const item = (id: string, imageUrls: Record<string, string>) => ({ id, imageUrls }) as unknown as Item;
const state = (title: string, items: Item[]): PaperState =>
  ({ paper: { id: "p", title }, sections: [], items }) as unknown as PaperState;

describe("adoptRemote", () => {
  it("takes the server's paper but keeps the signed URL of a picture already on screen", () => {
    const here = state("Old", [item("a", { "bank/1.png": "https://old/1" })]);
    const fresh = state("New", [
      item("a", { "bank/1.png": "https://new/1" }),
      item("b", { "bank/1.png": "https://new/1b", "bank/2.png": "https://new/2" }),
    ]);
    const next = adoptRemote(here, fresh);
    expect(next.paper.title).toBe("New");
    expect(next.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(next.items[0].imageUrls).toEqual({ "bank/1.png": "https://old/1" });
    expect(next.items[1].imageUrls).toEqual({ "bank/1.png": "https://old/1", "bank/2.png": "https://new/2" });
  });

  it("drops what the other teacher removed", () => {
    const next = adoptRemote(state("T", [item("a", {}), item("b", {})]), state("T", [item("b", {})]));
    expect(next.items.map((i) => i.id)).toEqual(["b"]);
  });
});
