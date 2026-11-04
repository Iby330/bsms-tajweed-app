import { describe, expect, it } from "vitest";
import { SEAT_COOKIE, seatFromCookieString, seatHeaders } from "./seat";

const id = "11111111-1111-4111-8111-111111111111";

describe("seatFromCookieString", () => {
  it("finds a valid seat among other cookies", () => {
    expect(seatFromCookieString(`a=1; ${SEAT_COOKIE}=${id}; b=2`)).toBe(id);
  });
  it("ignores absent and malformed values", () => {
    expect(seatFromCookieString("a=1")).toBeNull();
    expect(seatFromCookieString(`${SEAT_COOKIE}=nonsense`)).toBeNull();
  });
});

describe("seatHeaders", () => {
  it("adds the header only for a seat", () => {
    expect(seatHeaders(id)).toEqual({ "x-bsms-seat": id });
    expect(seatHeaders(null)).toEqual({});
  });
});
