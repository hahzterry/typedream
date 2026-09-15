import fsp from "node:fs/promises";
import path from "node:path";
import { newId, nowIso } from "./ids";
import { ensureProjectDirs, outputDir, refPath } from "./paths";
import { resolvePrompt } from "./prompt";
import { getVideoProvider } from "./providers";
import { mimeFor } from "./providers/fal";
import { getDb, listProjectIds, mutate, takesForShot } from "./store";
import type { Asset, RefImage, Take } from "./types";

const REMOTE_TTL_MS = 25 * 24 * 3600 * 1000; // fal storage keeps files ~30d; refresh before that

/** Upload a reference image (cached on the ref for fal) and return a URL the provider can read. */
export async function ensureRemoteUrl(pid: string, asset: Asset, ref: RefImage, providerName = getDb(pid).project.provider) {
  const cacheable = providerName === "fal";
  const fresh = ref.remoteUrl && ref.remoteUploadedAt && Date.now() - Date.parse(ref.remoteUploadedAt) < REMOTE_TTL_MS;
  if (cacheable && fresh && ref.remoteUrl?.startsWith("https://")) return ref.remoteUrl;
  const provider = getVideoProvider(providerName);
  const url = await provider.uploadFile(refPath(pid, asset.id, ref.file), mimeFor(ref.file));
  if (cacheable) {
    await mutate(pid, (db) => {
      const r = db.assets.find((x) => x.id === asset.id)?.refs.find((x) => x.id === ref.id);
      if (r) {
        r.remoteUrl = url;
        r.remoteUploadedAt = nowIso();
      }
    });
  }
  return url;
}

export interface GenerateOptions {
  count?: number;
  seed?: number;
  provider?: Take["provider"];
}

/** Resolve the prompt, upload refs, submit to the provider and record queued takes. */
export async function generateShot(pid: string, shotId: string, opts: GenerateOptions = {}): Promise<Take[]> {
  const db = getDb(pid);
  const shot = db.shots.find((s) => s.id === shotId);
  if (!shot) throw new Error(`Shot ${shotId} not found`);
  const scene = db.scenes.find((s) => s.id === shot.sceneId);
  const providerName = opts.provider ?? db.project.provider;
  const provider = getVideoProvider(providerName);

  const resolved = resolvePrompt(db, shot, scene);
  const refs = [];
  for (const r of resolved.refs) {
    const url = await ensureRemoteUrl(pid, r.asset, r.ref, providerName);
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
    const input = { model, prompt: resolved.prompt, imageUrls: refs.map((r) => r.url), ...params, seed: i === 0 ? params.seed : undefined };
    const take: Take = {
      id: newId("take"),
      shotId,
      n: takesForShot(getDb(pid), shotId).length + 1,
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
    await mutate(pid, (d) => {
      d.takes.push(take);
      const s = d.shots.find((x) => x.id === shotId);
      if (s) s.updatedAt = nowIso();
    });
    created.push(take);
  }
  return created;
}

async function fetchToFile(url: string, dest: string) {
  if (url.startsWith("file://")) {
    await fsp.copyFile(url.slice(7), dest);
    await fsp.rm(url.slice(7), { force: true }).catch(() => {});
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  await fsp.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

function mergeLogs(existing: string[] | undefined, incoming: string[]) {
  const out = [...(existing ?? [])];
  for (const l of incoming) if (!out.includes(l)) out.push(l);
  return out.slice(-60);
}

/** Poll one active take; download the video when done. Returns true if state changed. */
export async function pollTake(pid: string, takeId: string): Promise<boolean> {
  const take = getDb(pid).takes.find((t) => t.id === takeId);
  if (!take || !take.requestId || (take.status !== "queued" && take.status !== "running")) return false;
  const provider = getVideoProvider(take.provider);
  let status;
  try {
    status = await provider.poll(take.endpoint, take.requestId);
  } catch (e) {
    await mutate(pid, (db) => {
      const t = db.takes.find((x) => x.id === takeId);
      if (t) t.log = [...(t.log ?? []).slice(-20), `poll error: ${e instanceof Error ? e.message : String(e)}`];
    });
    return false;
  }

  if (status.state === "queued" || status.state === "running") {
    const st = status.state;
    const logs = status.logs;
    return mutate(pid, (db) => {
      const t = db.takes.find((x) => x.id === takeId)!;
      const changed = t.status !== st;
      t.status = st;
      if (st === "running") t.startedAt ??= nowIso();
      if (logs?.length) t.log = mergeLogs(t.log, logs);
      return changed;
    });
  }
  if (status.state === "failed") {
    const { error, logs } = status;
    await mutate(pid, (db) => {
      const t = db.takes.find((x) => x.id === takeId)!;
      t.status = "failed";
      t.error = error;
      t.finishedAt = nowIso();
      if (logs?.length) t.log = mergeLogs(t.log, logs);
    });
    return true;
  }

  // done: download into the project's output dir
  ensureProjectDirs(pid);
  const file = `${take.shotId}_${take.id}.mp4`;
  try {
    await fetchToFile(status.videoUrl, path.join(outputDir(pid), file));
  } catch (e) {
    const { videoUrl } = status;
    await mutate(pid, (db) => {
      const t = db.takes.find((x) => x.id === takeId)!;
      t.status = "failed";
      t.error = `video ready but download failed: ${e instanceof Error ? e.message : String(e)} (${videoUrl})`;
      t.videoUrl = videoUrl;
      t.finishedAt = nowIso();
    });
    return true;
  }
  const { videoUrl, seed, logs } = status;
  await mutate(pid, (db) => {
    const t = db.takes.find((x) => x.id === takeId)!;
    t.status = "done";
    t.videoFile = file;
    t.videoUrl = videoUrl;
    t.seedUsed = seed;
    t.finishedAt = nowIso();
    if (logs?.length) t.log = mergeLogs(t.log, logs);
    const shot = db.shots.find((s) => s.id === t.shotId);
    if (shot && !shot.selectedTakeId) shot.selectedTakeId = t.id;
  });
  return true;
}

export async function cancelTake(pid: string, takeId: string) {
  const take = getDb(pid).takes.find((t) => t.id === takeId);
  if (!take) throw new Error("take not found");
  if (take.requestId && (take.status === "queued" || take.status === "running")) {
    try {
      await getVideoProvider(take.provider).cancel?.(take.endpoint, take.requestId);
    } catch {
      /* best effort */
    }
  }
  await mutate(pid, (db) => {
    const t = db.takes.find((x) => x.id === takeId)!;
    if (t.status === "queued" || t.status === "running") {
      t.status = "cancelled";
      t.finishedAt = nowIso();
    }
  });
}

export function activeTakes(pid: string) {
  return getDb(pid).takes.filter((t) => t.status === "queued" || t.status === "running");
}

export function anyActive() {
  return listProjectIds().some((pid) => activeTakes(pid).length > 0);
}

/** Poll every active take in one project (or all projects). Returns number of takes whose state changed. */
export async function pollAll(pid?: string): Promise<number> {
  let changed = 0;
  for (const p of pid ? [pid] : listProjectIds()) {
    for (const t of activeTakes(p)) if (await pollTake(p, t.id)) changed++;
  }
  return changed;
}
