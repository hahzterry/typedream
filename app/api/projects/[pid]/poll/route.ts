import { handle, ok } from "@/lib/api";
import { activeTakes, pollAll } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** Force one poll pass for this project now (the server also polls on its own). */
export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/projects/[pid]/poll">) => {
  const { pid } = await ctx.params;
  const changed = await pollAll(pid);
  return ok({ changed, active: activeTakes(pid).length });
});
