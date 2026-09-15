import { body, handle, ok } from "@/lib/api";
import { deleteProject, getDb, mutate } from "@/lib/store";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

const EDITABLE: (keyof Project)[] = [
  "name", "description", "stylePrompt", "suffixPrompt", "provider", "model", "aspectRatio", "resolution",
  "generateAudio", "maxRefsPerAsset", "styleAssetId", "imageModel",
];

/** Full project state (everything the UI needs). */
export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/projects/[pid]">) => {
  const { pid } = await ctx.params;
  const db = getDb(pid);
  return ok({ ...db, env: { falKey: !!process.env.FAL_KEY, arkKey: !!process.env.ARK_API_KEY }, now: new Date().toISOString() });
});

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/projects/[pid]">) => {
  const { pid } = await ctx.params;
  const patch = await body<Partial<Project>>(req);
  const project = await mutate(pid, (db) => {
    for (const k of EDITABLE) if (k in patch) (db.project as unknown as Record<string, unknown>)[k] = patch[k] ?? undefined;
    return db.project;
  });
  return ok(project);
});

export const DELETE = handle(async (_req: Request, ctx: RouteContext<"/api/projects/[pid]">) => {
  const { pid } = await ctx.params;
  getDb(pid);
  await deleteProject(pid);
  return ok({ ok: true });
});
