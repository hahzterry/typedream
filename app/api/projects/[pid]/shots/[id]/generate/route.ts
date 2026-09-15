import { handle, ok } from "@/lib/api";
import { generateShot } from "@/lib/jobs";
import type { ProviderName } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/projects/[pid]/shots/[id]/generate">) => {
  const { pid, id } = await ctx.params;
  let b: { count?: number; seed?: number; provider?: ProviderName } = {};
  try {
    b = await req.json();
  } catch {
    /* empty body ok */
  }
  return ok(await generateShot(pid, id, b), { status: 202 });
});
