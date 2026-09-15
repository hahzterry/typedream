import { body, handle, ok } from "@/lib/api";
import { generateShot } from "@/lib/jobs";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Batch generate. Body: { shotIds?: string[], sceneId?: string, onlyDraft?: boolean, count?: number }
 * Default: every shot with no take yet.
 */
export const POST = handle(async (req: Request) => {
  const b = await body<{ shotIds?: string[]; sceneId?: string; onlyDraft?: boolean; count?: number }>(req);
  const db = getDb();
  let shots = db.shots;
  if (b.shotIds?.length) shots = shots.filter((s) => b.shotIds!.includes(s.id));
  if (b.sceneId) shots = shots.filter((s) => s.sceneId === b.sceneId);
  if (b.onlyDraft ?? !b.shotIds?.length) {
    shots = shots.filter((s) => !db.takes.some((t) => t.shotId === s.id && t.status !== "failed" && t.status !== "cancelled"));
  }
  const results = [];
  for (const s of shots) {
    try {
      const takes = await generateShot(s.id, { count: b.count });
      results.push({ shotId: s.id, takes: takes.map((t) => ({ id: t.id, status: t.status, error: t.error })) });
    } catch (e) {
      results.push({ shotId: s.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return ok(results, { status: 202 });
});
