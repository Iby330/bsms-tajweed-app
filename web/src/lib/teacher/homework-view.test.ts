import { describe, expect, it } from "vitest";
import { RESOURCES_TAB, waitingNote } from "./homework-view";

const tab = (id: string, waiting: number) => ({ id, waiting });

describe("waitingNote", () => {
  it("is nothing when only this week has scripts waiting", () => {
    expect(waitingNote([tab("this", 4), tab("w2", 0), tab(RESOURCES_TAB, 0)])).toBeNull();
  });

  it("points at the one earlier week with scripts waiting", () => {
    expect(waitingNote([tab("this", 0), tab("w2", 0), tab("w1", 3)])).toEqual({
      text: "3 scripts still waiting from an earlier week", show: "Show that week", target: 2,
    });
  });

  it("counts several earlier weeks together", () => {
    expect(waitingNote([tab("this", 0), tab("w2", 1), tab("w1", 2)])?.text)
      .toBe("3 scripts still waiting from earlier weeks");
  });

  it("names Resources rather than calling it an earlier week", () => {
    expect(waitingNote([tab("this", 0), tab("w2", 0), tab(RESOURCES_TAB, 10)])).toEqual({
      text: "10 scripts still waiting in Resources", show: "Show Resources", target: 2,
    });
  });

  it("names both when an earlier week and Resources have scripts waiting", () => {
    expect(waitingNote([tab("this", 0), tab("w2", 1), tab(RESOURCES_TAB, 10)])).toEqual({
      text: "11 scripts still waiting from an earlier week and in Resources", show: "Show that week", target: 1,
    });
  });
});
