// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Opening the link must not redeem it: that is the whole fix. Any Supabase
// client built while the page renders fails the test.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    throw new Error("the page must not talk to Supabase");
  },
}));

import ConfirmPage from "./page";

afterEach(cleanup);

async function renderPage(params: Record<string, string>) {
  render(await ConfirmPage({ searchParams: Promise.resolve(params) }));
}

describe("/auth/confirm", () => {
  it("shows a button that posts the token on, instead of redeeming it", async () => {
    await renderPage({ token_hash: "abc", type: "recovery", next: "/reset-password" });

    const button = screen.getByRole("button", { name: "Continue" });
    const form = button.closest("form")!;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/auth/confirm/verify");

    const field = (name: string) =>
      (form.querySelector(`input[name="${name}"]`) as HTMLInputElement | null)?.value;
    expect(field("token_hash")).toBe("abc");
    expect(field("type")).toBe("recovery");
    expect(field("next")).toBe("/reset-password");
    expect(screen.getByText("Choose a new password")).toBeTruthy();
  });

  it("a login email's link reads as setting up the account", async () => {
    await renderPage({ token_hash: "abc", type: "recovery", next: "/welcome" });
    expect(screen.getByText("Set up your account")).toBeTruthy();
  });

  it("a link with no token offers a new one rather than a dead button", async () => {
    await renderPage({});
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByRole("link", { name: "Request a new link" }).getAttribute("href"))
      .toBe("/forgot-password");
  });
});
