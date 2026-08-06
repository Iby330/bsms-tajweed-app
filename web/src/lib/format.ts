/** "2026-09-19" → "19 Sept" (en-GB short month). Used wherever a pass date shows. */
export const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(iso),
  );
