import { handle, ok } from "@/lib/api";
import { generateShot } from "@/lib/jobs";
import type { ProviderName } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/shots/[id]/generate">) => {
  const { id } = await ctx.params;
  let b: { count?: number; seed?: number; provider?: ProviderName } = {};
  try {
    b = await req.json();
  } catch {
    /* empty body ok */
  }
  const takes = await generateShot(id, b);
  return ok(takes, { status: 202 });
});
