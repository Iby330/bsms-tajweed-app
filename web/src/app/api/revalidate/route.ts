import { revalidateTag } from "next/cache";

/**
 * Drop the reference cache on demand.
 *
 * The seeds run outside the app — they write terms, weeks and surahs straight
 * to the database, where nothing tells Next the cached copies are now wrong.
 * After seeding prod, POST here instead of waiting out the hour.
 *
 * Second argument to `revalidateTag` is required in Next 16: the single-arg
 * form is deprecated (it expires immediately and blocks the next read).
 * "max" is the built-in profile — the tag is marked stale, the next visit
 * serves the old rows once and refreshes behind it.
 */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");

  // No secret configured is a refusal, not an open door.
  if (!secret || token !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  revalidateTag("reference", "max");
  return new Response(null, { status: 204 });
}
