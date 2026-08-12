import { Skeleton } from "@/components/ui/skeleton";

/** The loading fallback for both route groups. It earns its keep before it is
 *  ever seen: every page here is force-dynamic, and Next only partially
 *  prefetches a dynamic route when a loading.tsx exists — it prefetches
 *  layout → loading. That prefetched shell is what makes a sidebar click paint
 *  at once instead of hanging on the old screen until Supabase answers. */
export function PageSkeleton() {
  return (
    <div className="space-y-8" aria-busy>
      <span className="sr-only">Loading…</span>

      <header className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </header>

      <section className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-28 rounded-2xl" />
      </section>

      <section className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </section>
    </div>
  );
}
