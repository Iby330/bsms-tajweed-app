import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/**
 * ComingSoon — full-page stub for features shown on the nav but not yet
 * built (Resources · Seerah · Notifications · Manage curriculum).
 * The demo's "full surface area" principle: show the whole vision,
 * stub the unbuilt parts honestly.
 */
export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <Card className="w-full max-w-md border-line">
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <Badge variant="secondary" className="uppercase tracking-widest">
            Coming soon
          </Badge>
          <h1 className="text-2xl">{title}</h1>
          <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}
