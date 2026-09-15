import { HttpError, body, handle, ok } from "@/lib/api";
import { resolvePrompt } from "@/lib/prompt";
import { getDb, takesForShot } from "@/lib/store";
import { deleteShot, updateShot } from "@/lib/story";

export const dynamic = "force-dynamic";

/** Shot + its takes + the prompt as it would be sent right now. */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/projects/[pid]/shots/[id]">) => {
  const { pid, id } = await ctx.params;
  const db = getDb(pid);
  const shot = db.shots.find((s) => s.id === id);
  if (!shot) throw new HttpError(404, "shot not found");
  const scene = db.scenes.find((s) => s.id === shot.sceneId);
  const resolved = resolvePrompt(db, shot, scene);
  return ok({
    shot,
    scene,
    takes: takesForShot(db, id),
    preview: {
      prompt: resolved.prompt,
      warnings: resolved.warnings,
      refs: resolved.refs.map((r) => ({ assetId: r.asset.id, assetName: r.asset.name, refId: r.ref.id, file: r.ref.file, label: r.ref.label, imageIndex: r.imageIndex })),
    },
  });
});

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/projects/[pid]/shots/[id]">) => {
  const { pid, id } = await ctx.params;
  return ok(await updateShot(pid, id, await body(req)));
});

export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/projects/[pid]/shots/[id]">) => {
  const { pid, id } = await ctx.params;
  await deleteShot(pid, id);
  return ok({ ok: true });
});
