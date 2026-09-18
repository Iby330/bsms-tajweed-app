// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TeacherHifdhTabs } from "./teacher-hifdh-tabs";

afterEach(cleanup);

describe("TeacherHifdhTabs", () => {
  it("links Overview to the register and Hear to the desk", () => {
    render(<TeacherHifdhTabs active="overview" />);
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("href")).toBe("/teacher/hifdh");
    expect(screen.getByRole("link", { name: "Hear" }).getAttribute("href")).toBe("/teacher/hifdh/hear");
  });

  it("marks Overview active and Hear inactive", () => {
    render(<TeacherHifdhTabs active="overview" />);
    expect(screen.getByRole("link", { name: "Overview" }).className).toContain("bg-background");
    expect(screen.getByRole("link", { name: "Hear" }).className).not.toContain("bg-background");
  });

  it("marks Hear active and Overview inactive", () => {
    render(<TeacherHifdhTabs active="hear" />);
    expect(screen.getByRole("link", { name: "Hear" }).className).toContain("bg-background");
    expect(screen.getByRole("link", { name: "Overview" }).className).not.toContain("bg-background");
  });
});
