import { describe, expect, it } from "vitest";
import { RESOURCES_TAB, pickedWeek, waitingNote, withPickedTab } from "./homework-view";

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

describe("pickedWeek", () => {
  const choices = [{ id: "w3", label: "This week · Week 3" }, { id: "w2", label: "Week 2" }, { id: "w1", label: "Week 1" }];

  it("is the earlier week the address asks for", () => {
    expect(pickedWeek("w1", choices, "w3")).toBe("w1");
  });

  it("is nothing for this week, an unknown week, or no week at all", () => {
    expect(pickedWeek("w3", choices, "w3")).toBeNull();
    expect(pickedWeek("w9", choices, "w3")).toBeNull();
    expect(pickedWeek(undefined, choices, "w3")).toBeNull();
  });
});

describe("withPickedTab", () => {
  const t = (id: string) => ({ tab: { id } });
  const tabs = [t("this"), t("w2"), t(RESOURCES_TAB)];

  it("opens on this week when no week is picked", () => {
    expect(withPickedTab(tabs, null)).toEqual({ entries: tabs, initial: 0 });
  });

  it("opens a picked week that already has a tab on that tab", () => {
    expect(withPickedTab(tabs, t("w2"))).toEqual({ entries: tabs, initial: 1 });
  });

  it("adds a picked week after the other weeks, before Resources, and opens on it", () => {
    expect(withPickedTab(tabs, t("w1"))).toEqual({
      entries: [t("this"), t("w2"), t("w1"), t(RESOURCES_TAB)], initial: 2,
    });
  });

  it("adds it last when there is no Resources tab", () => {
    expect(withPickedTab([t("this")], t("w1"))).toEqual({ entries: [t("this"), t("w1")], initial: 1 });
  });
});
