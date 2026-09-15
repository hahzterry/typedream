import { body, handle, ok } from "@/lib/api";
import { deleteAsset, updateAsset } from "@/lib/assets";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/assets/[id]">) => {
  const { id } = await ctx.params;
  return ok(await updateAsset(id, await body(req)));
});

export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/assets/[id]">) => {
  const { id } = await ctx.params;
  await deleteAsset(id);
  return ok({ ok: true });
});
