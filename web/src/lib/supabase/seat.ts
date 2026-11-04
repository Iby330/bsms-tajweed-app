/**
 * Which profile row this browser session is acting as. This selects a view and
 * grants nothing: acting_id() in the database ignores a seat the login doesn't
 * own. A session cookie, so a fresh visit opens on the teacher's own class.
 */
export const SEAT_COOKIE = "bsms_seat";
export const SEAT_HEADER = "x-bsms-seat";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validSeat(value: string | null | undefined): string | null {
  return value && UUID_RE.test(value) ? value : null;
}

export function seatFromCookieString(cookie: string): string | null {
  const hit = cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${SEAT_COOKIE}=`));
  return validSeat(hit?.slice(SEAT_COOKIE.length + 1));
}

export function seatHeaders(seat: string | null): Record<string, string> {
  return seat ? { [SEAT_HEADER]: seat } : {};
}
