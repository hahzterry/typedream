import { body, handle, ok } from "@/lib/api";
import { generateRefs } from "@/lib/assets";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/assets/[id]/refs/generate">) => {
  const { id } = await ctx.params;
  const b = await body<{ prompt?: string; n?: number; width?: number; height?: number; seed?: number; label?: string; useDescription?: boolean }>(req);
  return ok(await generateRefs(id, b), { status: 201 });
});
