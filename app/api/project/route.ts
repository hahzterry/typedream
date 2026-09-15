import { body, handle, ok } from "@/lib/api";
import { getDb, mutate } from "@/lib/store";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

const EDITABLE: (keyof Project)[] = [
  "name", "stylePrompt", "suffixPrompt", "provider", "model", "aspectRatio", "resolution",
  "generateAudio", "maxRefsPerAsset", "styleAssetId", "imageModel",
];

export const GET = handle(async () => ok(getDb().project));

export const PATCH = handle(async (req: Request) => {
  const patch = await body<Partial<Project>>(req);
  const project = await mutate((db) => {
    for (const k of EDITABLE) {
      if (k in patch) (db.project as unknown as Record<string, unknown>)[k] = patch[k];
    }
    return db.project;
  });
  return ok(project);
});
