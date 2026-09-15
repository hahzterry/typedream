import fsp from "node:fs/promises";
import path from "node:path";
import { newId, nowIso } from "./ids";
import { OUTPUT_DIR, ensureDirs, refPath } from "./paths";
import { resolvePrompt } from "./prompt";
import { getVideoProvider } from "./providers";
import { mimeFor } from "./providers/fal";
import { mockResolveLocal } from "./providers/mock";
import { getDb, mutate, takesForShot } from "./store";
import type { Asset, RefImage, Take, TakeRef } from "./types";

const REMOTE_TTL_MS = 25 * 24 * 3600 * 1000; // fal storage default lifetime is ~30d; refresh before that

/** Upload a reference image (cached on the ref) and return its public URL. */
export async function ensureRemoteUrl(asset: Asset, ref: RefImage, providerName = getDb().project.provider) {
  // Only fal uploads are cached (public https URLs). ark uses data URIs, mock uses file:// paths.
  const cacheable = providerName === "fal";
  const fresh = ref.remoteUrl && ref.remoteUploadedAt && Date.now() - Date.parse(ref.remoteUploadedAt) < REMOTE_TTL_MS;
  if (cacheable && fresh && ref.remoteUrl?.startsWith("https://")) return ref.remoteUrl;
  const provider = getVideoProvider(providerName);
  const local = refPath(asset.id, ref.file);
  const url = await provider.uploadFile(local, mimeFor(ref.file));
  if (cacheable) {
    await mutate((db) => {
      const a = db.assets.find((x) => x.id === asset.id);
      const r = a?.refs.find((x) => x.id === ref.id);
      if (r) {
        r.remoteUrl = url;
        r.remoteUploadedAt = nowIso();
      }
    });
  }
  return url;
}

export interface GenerateOptions {
  /** number of takes to submit */
  count?: number;
  seed?: number;
  /** override the project provider for this take */
  provider?: Take["provider"];
}

/** Resolve the prompt, upload refs, submit to the provider and record a queued take. */
export async function generateShot(shotId: string, opts: GenerateOptions = {}): Promise<Take[]> {
  const db = getDb();
  const shot = db.shots.find((s) => s.id === shotId);
  if (!shot) throw new Error(`Shot ${shotId} not found`);
  const scene = db.scenes.find((s) => s.id === shot.sceneId);
  const providerName = opts.provider ?? db.project.provider;
  const provider = getVideoProvider(providerName);

  const resolved = resolvePrompt(db, shot, scene);
  const refs: TakeRef[] = [];
  for (const r of resolved.refs) {
    const url = await ensureRemoteUrl(r.asset, r.ref, providerName);
    refs.push({ assetId: r.asset.id, assetName: r.asset.name, refId: r.ref.id, imageIndex: r.imageIndex, url });
  }

  const model = shot.model ?? db.project.model;
  const params: Take["params"] = {
    duration: shot.duration ?? "auto",
    aspectRatio: shot.aspectRatio ?? db.project.aspectRatio,
    resolution: shot.resolution ?? db.project.resolution,
    generateAudio: shot.generateAudio ?? db.project.generateAudio,
    seed: opts.seed ?? shot.seed,
  };

  const count = Math.max(1, Math.min(4, opts.count ?? 1));
  const created: Take[] = [];
  for (let i = 0; i < count; i++) {
    const input = {
      model,
      prompt: resolved.prompt,
      imageUrls: refs.map((r) => r.url),
      ...params,
      seed: i === 0 ? params.seed : undefined, // extra takes get fresh seeds
    };
    const take: Take = {
      id: newId("take"),
      shotId,
      n: takesForShot(getDb(), shotId).length + created.length + 1,
      status: "queued",
      provider: providerName,
      model,
      endpoint: "",
      resolvedPrompt: resolved.prompt,
      refs,
      params: { ...params, seed: input.seed },
      estCostUsd: provider.estimateCost?.(input),
      log: resolved.warnings.map((w) => `warning: ${w}`),
      createdAt: nowIso(),
    };
    try {
      const sub = await provider.submit(input);
      take.requestId = sub.requestId;
      take.endpoint = sub.endpoint;
    } catch (e) {
      take.status = "failed";
      take.error = e instanceof Error ? e.message : String(e);
      take.finishedAt = nowIso();
    }
    await mutate((d) => {
      d.takes.push(take);
      const s = d.shots.find((x) => x.id === shotId);
      if (s) s.updatedAt = nowIso();
    });
    created.push(take);
  }
  return created;
}

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(dest, buf);
  return buf.length;
}

/** Poll one active take; download the video when done. Returns true if state changed. */
export async function pollTake(takeId: string): Promise<boolean> {
  const take = getDb().takes.find((t) => t.id === takeId);
  if (!take || !take.requestId || (take.status !== "queued" && take.status !== "running")) return false;
  const provider = getVideoProvider(take.provider);
  let status;
  try {
    status = await provider.poll(take.endpoint, take.requestId);
  } catch (e) {
    // transient network error: keep the take alive, note it
    await mutate((db) => {
      const t = db.takes.find((x) => x.id === takeId);
      if (t) t.log = [...(t.log ?? []).slice(-20), `poll error: ${e instanceof Error ? e.message : String(e)}`];
    });
    return false;
  }

  if (status.state === "queued") {
    return mutate((db) => {
      const t = db.takes.find((x) => x.id === takeId)!;
      const changed = t.status !== "queued";
      t.status = "queued";
      if (status.logs?.length) t.log = mergeLogs(t.log, status.logs);
      return changed;
    });
  }
  if (status.state === "running") {
    return mutate((db) => {
      const t = db.takes.find((x) => x.id === takeId)!;
      const changed = t.status !== "running";
      t.status = "running";
      t.startedAt ??= nowIso();
      if (status.logs?.length) t.log = mergeLogs(t.log, status.logs);
      return changed;
    });
  }
  if (status.state === "failed") {
    await mutate((db) => {
      const t = db.takes.find((x) => x.id === takeId)!;
      t.status = "failed";
      t.error = status.error;
      t.finishedAt = nowIso();
      if (status.logs?.length) t.log = mergeLogs(t.log, status.logs);
    });
    return true;
  }

  // done: download
  ensureDirs();
  let file: string;
  try {
    if (status.videoUrl.startsWith("mock://")) {
      file = await mockResolveLocal(status.videoUrl);
    } else {
      file = `${take.shotId}_${take.id}.mp4`;
      await download(status.videoUrl, path.join(OUTPUT_DIR, file));
    }
  } catch (e) {
    await mutate((db) => {
      const t = db.takes.find((x) => x.id === takeId)!;
      t.status = "failed";
      t.error = `video ready but download failed: ${e instanceof Error ? e.message : String(e)} (${status.videoUrl})`;
      t.videoUrl = status.videoUrl;
      t.finishedAt = nowIso();
    });
    return true;
  }
  await mutate((db) => {
    const t = db.takes.find((x) => x.id === takeId)!;
    t.status = "done";
    t.videoFile = file;
    t.videoUrl = status.videoUrl;
    t.seedUsed = status.seed;
    t.finishedAt = nowIso();
    if (status.logs?.length) t.log = mergeLogs(t.log, status.logs);
    const shot = db.shots.find((s) => s.id === t.shotId);
    if (shot && !shot.selectedTakeId) shot.selectedTakeId = t.id; // auto-select first success
  });
  return true;
}

function mergeLogs(existing: string[] | undefined, incoming: string[]) {
  const out = [...(existing ?? [])];
  for (const l of incoming) if (!out.includes(l)) out.push(l);
  return out.slice(-60);
}

export async function cancelTake(takeId: string) {
  const take = getDb().takes.find((t) => t.id === takeId);
  if (!take) throw new Error("take not found");
  if (take.requestId && (take.status === "queued" || take.status === "running")) {
    const provider = getVideoProvider(take.provider);
    try {
      await provider.cancel?.(take.endpoint, take.requestId);
    } catch {
      /* best effort */
    }
  }
  await mutate((db) => {
    const t = db.takes.find((x) => x.id === takeId)!;
    if (t.status === "queued" || t.status === "running") {
      t.status = "cancelled";
      t.finishedAt = nowIso();
    }
  });
}

export function activeTakes() {
  return getDb().takes.filter((t) => t.status === "queued" || t.status === "running");
}

/** Poll every active take once. Returns number of takes whose state changed. */
export async function pollAll(): Promise<number> {
  let changed = 0;
  for (const t of activeTakes()) {
    if (await pollTake(t.id)) changed++;
  }
  return changed;
}
