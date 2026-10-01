// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HifzTabs } from "./hifz-tabs";

afterEach(cleanup);

describe("HifzTabs", () => {
  it("is Overview | Review by default, for the student's own page", () => {
    render(<HifzTabs basePath="/hifdh" active="review" />);
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("href")).toBe("/hifdh");
    expect(screen.getByRole("link", { name: "Review" }).getAttribute("href")).toBe("/hifdh?tab=review");
    expect(screen.getByRole("link", { name: "Review" }).className).toContain("bg-background");
    expect(screen.getByRole("link", { name: "Overview" }).className).not.toContain("bg-background");
  });

  it("takes other tabs, as a teacher's student page does", () => {
    render(
      <HifzTabs basePath="/teacher/hifdh/s1" active="hear"
        tabs={[{ id: "overview", label: "Overview" }, { id: "hear", label: "Hear" }]} />,
    );
    expect(screen.queryByRole("link", { name: "Review" })).toBeNull();
    expect(screen.getByRole("link", { name: "Hear" }).getAttribute("href")).toBe("/teacher/hifdh/s1?tab=hear");
    expect(screen.getByRole("link", { name: "Hear" }).className).toContain("bg-background");
  });
});
