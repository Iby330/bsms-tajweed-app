// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const verifyOtp = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: {
    cookies: { setAll: (c: { name: string; value: string; options: object }[]) => void };
  }) => ({
    auth: {
      verifyOtp: async (args: unknown) => {
        const result = await verifyOtp(args);
        if (!result.error) {
          opts.cookies.setAll([{ name: "sb-test-auth-token", value: "session", options: { path: "/" } }]);
        }
        return result;
      },
    },
  }),
}));

import { POST } from "./route";

function post(fields: Record<string, string>) {
  return new NextRequest("https://www.bsmstajweed.com/auth/confirm/verify", {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

beforeEach(() => verifyOtp.mockReset());

describe("POST /auth/confirm/verify", () => {
  it("redeems the token and sends them on with a 303, session and recovery cookies set", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await POST(post({ token_hash: "abc", type: "recovery", next: "/welcome" }));

    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc" });
    // 303, not 307: a 307 would repeat the POST against /welcome.
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://www.bsmstajweed.com/welcome");
    expect(res.cookies.get("sb-test-auth-token")?.value).toBe("session");
    expect(res.cookies.get("bsms-recovery")?.value).toBe("1");
  });

  it("a spent or expired token goes to the request-a-new-link screen", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    const res = await POST(post({ token_hash: "abc", type: "recovery", next: "/reset-password" }));

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://www.bsmstajweed.com/forgot-password?error=link");
    expect(res.cookies.get("bsms-recovery")).toBeUndefined();
  });

  it("a missing token never reaches Supabase", async () => {
    const res = await POST(post({ type: "recovery" }));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe("https://www.bsmstajweed.com/forgot-password?error=link");
  });

  it("next is only followed on this site", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await POST(post({ token_hash: "abc", type: "recovery", next: "https://evil.com" }));
    expect(res.headers.get("location")).toBe("https://www.bsmstajweed.com/home");
  });

  it("only a recovery token earns the recovery cookie", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await POST(post({ token_hash: "abc", type: "email", next: "/home" }));
    expect(res.cookies.get("bsms-recovery")).toBeUndefined();
  });
});
