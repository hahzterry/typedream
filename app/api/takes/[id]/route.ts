import fsp from "node:fs/promises";
import { HttpError, body, handle, ok } from "@/lib/api";
import { cancelTake } from "@/lib/jobs";
import { outputPath } from "@/lib/paths";
import { getDb, mutate } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/takes/[id]">) => {
  const { id } = await ctx.params;
  const t = getDb().takes.find((x) => x.id === id);
  if (!t) throw new HttpError(404, "take not found");
  return ok(t);
});

/** rating / notes, or { select: true } to make it the shot's chosen take */
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/takes/[id]">) => {
  const { id } = await ctx.params;
  const b = await body<{ rating?: number; notes?: string; select?: boolean }>(req);
  const take = await mutate((db) => {
    const t = db.takes.find((x) => x.id === id);
    if (!t) throw new HttpError(404, "take not found");
    if (b.rating !== undefined) t.rating = b.rating;
    if (b.notes !== undefined) t.notes = b.notes;
    if (b.select) {
      const s = db.shots.find((x) => x.id === t.shotId);
      if (s) s.selectedTakeId = t.id;
    }
    return t;
  });
  return ok(take);
});

/** Cancel if active; otherwise delete the take and its video. */
export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/takes/[id]">) => {
  const { id } = await ctx.params;
  const t = getDb().takes.find((x) => x.id === id);
  if (!t) throw new HttpError(404, "take not found");
  if (t.status === "queued" || t.status === "running") {
    await cancelTake(id);
    return ok({ cancelled: true });
  }
  await mutate((db) => {
    db.takes = db.takes.filter((x) => x.id !== id);
    const s = db.shots.find((x) => x.id === t.shotId);
    if (s?.selectedTakeId === id) s.selectedTakeId = db.takes.find((x) => x.shotId === s.id && x.status === "done")?.id;
  });
  if (t.videoFile) await fsp.rm(outputPath(t.videoFile), { force: true });
  return ok({ deleted: true });
});
