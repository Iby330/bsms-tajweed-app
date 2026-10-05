/**
 * Why a server action threw: the student's connection, or a page that has
 * outlived the build it was served by.
 *
 * A page keeps the server-action ids of the deploy it was loaded from. Push a
 * release while a student has a homework open and every save and hand-in from
 * that tab throws — on a connection that is fine. Telling them to "check your
 * connection" sent students in circles on 5 October with the deadline minutes
 * away; a reload was all it took.
 *
 * So when an action throws, ask the site for something small. If it answers,
 * the network is fine and the page is the problem — reload it. If it doesn't,
 * it really is the connection. A server fault inside the action also reads as
 * "updated", and a reload is the right advice for that too.
 */
export type ActionFailure = "updated" | "offline";

export async function whyActionFailed(): Promise<ActionFailure> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  try {
    const res = await fetch("/favicon.ico", { method: "HEAD", cache: "no-store" });
    return res.ok ? "updated" : "offline";
  } catch {
    return "offline";
  }
}

export const STALE_PAGE =
  "The app was updated while this page was open. Reload the page to carry on; the answers already saved are kept.";
