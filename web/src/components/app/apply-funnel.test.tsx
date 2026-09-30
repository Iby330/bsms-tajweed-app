// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ApplyFunnel } from "./apply-funnel";

vi.mock("@/lib/applications/actions", () => ({
  submitApplication: vi.fn(async () => ({ ok: true as const })),
}));

afterEach(cleanup);

const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const pick = (option: string) => fireEvent.click(screen.getByText(option, { selector: "span" }));
const heading = () => screen.getByRole("heading", { level: 2 }).textContent;

/** Through the first four questions to the university one. */
function toUniversity() {
  render(<ApplyFunnel />);
  fireEvent.click(screen.getByRole("button", { name: "Start my application" }));
  pick("Male"); next();
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Bilal" } });
  fireEvent.change(screen.getByLabelText("Surname"), { target: { value: "Ahmed" } });
  next();
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "b@a.co" } });
  next();
  fireEvent.change(
    screen.getByLabelText("Phone number, without the country code"),
    { target: { value: "07700 900123" } },
  );
  next();
  expect(heading()).toBe("Which university are you at?");
}

describe("the university question", () => {
  it("goes straight to the year for a university", () => {
    toUniversity();
    pick("Sussex"); next();
    expect(heading()).toBe("Which year are you in?");
    expect(screen.getByText("Alumni", { selector: "span" })).toBeTruthy();
  });

  it("asks which university under Another university, then the year", () => {
    toUniversity();
    pick("Another university");
    fireEvent.change(screen.getByLabelText("Which university?"), { target: { value: "Kent" } });
    next();
    expect(heading()).toBe("Which year are you in?");
  });

  it("asks what they do under Other, and only years 1 and 2 for college", () => {
    toUniversity();
    pick("Other"); next();
    expect(heading()).toBe("What are you doing at the moment?");
    pick("College"); next();
    expect(heading()).toBe("Which year of college are you in?");
    expect(screen.getByText("1", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("2", { selector: "span" })).toBeTruthy();
    expect(screen.queryByText("3", { selector: "span" })).toBeNull();
    expect(screen.queryByText("Alumni", { selector: "span" })).toBeNull();
  });

  it("skips the year for a gap year, and Back skips it too", () => {
    toUniversity();
    pick("Other"); next();
    pick("Gap year"); next();
    expect(heading()).toBe("Have you been on BSMS Tajweed before?");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(heading()).toBe("What are you doing at the moment?");
  });

  it("counts the question Other adds", () => {
    toUniversity();
    expect(screen.getByText("5 of 13")).toBeTruthy();
    pick("Other"); next();
    pick("College"); next();
    expect(screen.getByText("7 of 14")).toBeTruthy();
  });
});

describe("the waiting list", () => {
  it("opens as the waiting list, and asks for agreement to pay later, not payment", () => {
    render(<ApplyFunnel waitlist />);
    expect(screen.getByText("Join the waiting list for")).toBeTruthy();
    expect(screen.queryByText(/Applications close/)).toBeNull();
    expect(screen.getByRole("button", { name: "Join the waiting list" })).toBeTruthy();
  });
});
