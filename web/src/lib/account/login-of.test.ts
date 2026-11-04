import { describe, expect, it } from "vitest";
import { loginIdOf } from "./login-of";

describe("loginIdOf", () => {
  it("is the owner for a seat", () => expect(loginIdOf({ id: "seat", login_id: "owner" })).toBe("owner"));
  it("is the profile itself otherwise", () => {
    expect(loginIdOf({ id: "me", login_id: null })).toBe("me");
    expect(loginIdOf(null, "fallback")).toBe("fallback");
  });
});
