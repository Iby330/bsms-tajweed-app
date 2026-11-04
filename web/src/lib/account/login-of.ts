/** Whose auth user a profile's email lives on. A seat has none of its own. */
export function loginIdOf(p: { id: string; login_id: string | null } | null, fallback?: string): string {
  return p?.login_id ?? p?.id ?? fallback ?? "";
}
