import { newId, nowIso } from "./ids";
import { findAsset, findScene, mutate } from "./store";
import type { AspectRatio, Db, ModelFamily, Resolution, Scene, Shot } from "./types";

// Scenes + shots CRUD and bulk import ("script" JSON written by the director).

export async function createScene(input: { title: string; description?: string; locationId?: string; order?: number }): Promise<Scene> {
  return mutate((db) => {
    const scene: Scene = {
      id: newId("sc"),
      order: input.order ?? nextOrder(db.scenes),
      title: input.title.trim(),
      description: input.description,
      locationId: input.locationId ? findAsset(db, input.locationId)?.id : undefined,
    };
    db.scenes.push(scene);
    return scene;
  });
}

export async function updateScene(id: string, patch: Partial<Omit<Scene, "id">>) {
  return mutate((db) => {
    const s = db.scenes.find((x) => x.id === id);
    if (!s) throw new Error("scene not found");
    if (patch.locationId !== undefined) patch.locationId = patch.locationId ? findAsset(db, patch.locationId)?.id : undefined;
    Object.assign(s, patch);
    return s;
  });
}

export async function deleteScene(id: string) {
  await mutate((db) => {
    db.scenes = db.scenes.filter((s) => s.id !== id);
    const shotIds = new Set(db.shots.filter((s) => s.sceneId === id).map((s) => s.id));
    db.shots = db.shots.filter((s) => s.sceneId !== id);
    db.takes = db.takes.filter((t) => !shotIds.has(t.shotId));
  });
}

export interface ShotInput {
  sceneId: string;
  title: string;
  prompt: string;
  assetIds?: string[];
  duration?: number | "auto";
  aspectRatio?: AspectRatio;
  resolution?: Resolution;
  model?: ModelFamily;
  generateAudio?: boolean;
  seed?: number;
  omitStyle?: boolean;
  notes?: string;
  order?: number;
}

export async function createShot(input: ShotInput): Promise<Shot> {
  return mutate((db) => {
    const scene = findScene(db, input.sceneId);
    if (!scene) throw new Error(`scene ${input.sceneId} not found`);
    const t = nowIso();
    const shot: Shot = {
      id: newId("shot"),
      sceneId: scene.id,
      order: input.order ?? nextOrder(db.shots.filter((s) => s.sceneId === scene.id)),
      title: input.title.trim(),
      prompt: input.prompt,
      assetIds: (input.assetIds ?? []).map((x) => findAsset(db, x)?.id).filter((x): x is string => !!x),
      duration: input.duration ?? "auto",
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      model: input.model,
      generateAudio: input.generateAudio,
      seed: input.seed,
      omitStyle: input.omitStyle,
      notes: input.notes,
      createdAt: t,
      updatedAt: t,
    };
    db.shots.push(shot);
    return shot;
  });
}

export async function updateShot(id: string, patch: Partial<Omit<Shot, "id" | "createdAt">>) {
  return mutate((db) => {
    const s = db.shots.find((x) => x.id === id);
    if (!s) throw new Error("shot not found");
    if (patch.assetIds) patch.assetIds = patch.assetIds.map((x) => findAsset(db, x)?.id).filter((x): x is string => !!x);
    if (patch.sceneId) {
      const sc = findScene(db, patch.sceneId);
      if (!sc) throw new Error("scene not found");
      patch.sceneId = sc.id;
    }
    if (patch.selectedTakeId && !db.takes.some((t) => t.id === patch.selectedTakeId && t.shotId === id)) {
      throw new Error("take does not belong to this shot");
    }
    Object.assign(s, patch, { updatedAt: nowIso() });
    return s;
  });
}

export async function deleteShot(id: string) {
  await mutate((db) => {
    db.shots = db.shots.filter((s) => s.id !== id);
    db.takes = db.takes.filter((t) => t.shotId !== id);
  });
}

/** Reorder shots within a scene: ids in desired order. */
export async function reorderShots(sceneId: string, ids: string[]) {
  await mutate((db) => {
    ids.forEach((id, i) => {
      const s = db.shots.find((x) => x.id === id && x.sceneId === sceneId);
      if (s) s.order = i + 1;
    });
  });
}

function nextOrder(items: { order: number }[]) {
  return items.reduce((m, s) => Math.max(m, s.order), 0) + 1;
}

// ---- bulk import ----

export interface ScriptFile {
  project?: Partial<Pick<Db["project"], "name" | "stylePrompt" | "suffixPrompt" | "model" | "aspectRatio" | "resolution" | "generateAudio" | "maxRefsPerAsset">>;
  assets?: { kind: "character" | "location" | "style" | "prop"; name: string; tag?: string; description?: string; notes?: string; refs?: string[] }[];
  scenes?: {
    title: string;
    description?: string;
    location?: string; // asset tag/name/id
    shots: (Omit<ShotInput, "sceneId" | "assetIds"> & { assets?: string[] })[];
  }[];
}

export async function importScript(script: ScriptFile, deps: { createAsset: typeof import("./assets").createAsset; addRefFromPath: typeof import("./assets").addRefFromPath }) {
  const report = { assets: 0, refs: 0, scenes: 0, shots: 0, warnings: [] as string[] };
  if (script.project) {
    await mutate((db) => Object.assign(db.project, script.project));
  }
  for (const a of script.assets ?? []) {
    let asset;
    try {
      asset = await deps.createAsset(a);
      report.assets++;
    } catch (e) {
      report.warnings.push(`asset ${a.name}: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    for (const p of a.refs ?? []) {
      try {
        await deps.addRefFromPath(asset.id, p);
        report.refs++;
      } catch (e) {
        report.warnings.push(`ref ${p}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  for (const sc of script.scenes ?? []) {
    const scene = await createScene({ title: sc.title, description: sc.description, locationId: sc.location });
    report.scenes++;
    for (const sh of sc.shots ?? []) {
      const { assets, ...rest } = sh;
      await createShot({ ...rest, sceneId: scene.id, assetIds: assets });
      report.shots++;
    }
  }
  return report;
}
