// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const switchView = vi.fn(async (seat: string | null) => void seat);
vi.mock("@/lib/account/switch-view", () => ({ switchView: (s: string | null) => switchView(s) }));

import { ViewSwitch } from "./view-switch";

afterEach(() => {
  cleanup();
  switchView.mockClear();
});

describe("ViewSwitch", () => {
  it("goes into the seat it names", async () => {
    render(<ViewSwitch target={{ seatId: "seat-1", label: "Esteemed Ustadhs" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Esteemed Ustadhs" }));
    await waitFor(() => expect(switchView).toHaveBeenCalledWith("seat-1"));
  });

  it("goes back with no seat", async () => {
    render(<ViewSwitch target={{ seatId: null, label: "Back to my class" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to my class" }));
    await waitFor(() => expect(switchView).toHaveBeenCalledWith(null));
  });
});
