import { body, handle, ok } from "@/lib/api";
import { deleteScene, reorderShots, updateScene } from "@/lib/story";
import type { Scene } from "@/lib/types";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/projects/[pid]/scenes/[id]">) => {
  const { pid, id } = await ctx.params;
  const { shotOrder, ...patch } = await body<Partial<Omit<Scene, "id">> & { shotOrder?: string[] }>(req);
  if (shotOrder) await reorderShots(pid, id, shotOrder);
  return ok(Object.keys(patch).length ? await updateScene(pid, id, patch) : { ok: true });
});

export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/projects/[pid]/scenes/[id]">) => {
  const { pid, id } = await ctx.params;
  await deleteScene(pid, id);
  return ok({ ok: true });
});
