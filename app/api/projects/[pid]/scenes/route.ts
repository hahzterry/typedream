import { body, handle, ok, required } from "@/lib/api";
import { getDb } from "@/lib/store";
import { createScene, reorderScenes } from "@/lib/story";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/projects/[pid]/scenes">) => {
  const { pid } = await ctx.params;
  return ok(getDb(pid).scenes);
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/projects/[pid]/scenes">) => {
  const { pid } = await ctx.params;
  const b = await body<{ title: string; description?: string; locationId?: string }>(req);
  return ok(await createScene(pid, { ...b, title: required(b.title, "title") }), { status: 201 });
});

/** Reorder scenes: { order: [sceneIds] } */
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/projects/[pid]/scenes">) => {
  const { pid } = await ctx.params;
  const { order } = await body<{ order: string[] }>(req);
  await reorderScenes(pid, required(order, "order"));
  return ok({ ok: true });
});
