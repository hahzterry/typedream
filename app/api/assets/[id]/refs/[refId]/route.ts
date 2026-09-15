import { body, handle, ok } from "@/lib/api";
import { deleteRef, updateRef } from "@/lib/assets";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/assets/[id]/refs/[refId]">) => {
  const { id, refId } = await ctx.params;
  return ok(await updateRef(id, refId, await body(req)));
});

export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/assets/[id]/refs/[refId]">) => {
  const { id, refId } = await ctx.params;
  await deleteRef(id, refId);
  return ok({ ok: true });
});
