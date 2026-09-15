import { body, handle, ok } from "@/lib/api";
import { deleteAsset, updateAsset } from "@/lib/assets";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/projects/[pid]/assets/[id]">) => {
  const { pid, id } = await ctx.params;
  return ok(await updateAsset(pid, id, await body(req)));
});

export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/projects/[pid]/assets/[id]">) => {
  const { pid, id } = await ctx.params;
  await deleteAsset(pid, id);
  return ok({ ok: true });
});
