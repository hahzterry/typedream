import { body, handle, ok } from "@/lib/api";
import { deleteRef, updateRef } from "@/lib/assets";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/projects/[pid]/assets/[id]/refs/[refId]">) => {
  const { pid, id, refId } = await ctx.params;
  return ok(await updateRef(pid, id, refId, await body(req)));
});

export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/projects/[pid]/assets/[id]/refs/[refId]">) => {
  const { pid, id, refId } = await ctx.params;
  await deleteRef(pid, id, refId);
  return ok({ ok: true });
});
