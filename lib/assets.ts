import fsp from "node:fs/promises";
import path from "node:path";
import { newId, nowIso, slugify } from "./ids";
import { ensureProjectDirs, refPath, refsDir } from "./paths";
import { getImageProvider } from "./providers";
import { getDb, mutate } from "./store";
import type { Asset, AssetKind, RefImage } from "./types";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function createAsset(pid: string, input: { kind: AssetKind; name: string; tag?: string; description?: string; notes?: string }): Promise<Asset> {
  const t = nowIso();
  const tag = slugify(input.tag ?? input.name);
  return mutate(pid, (db) => {
    if (db.assets.some((a) => a.tag === tag)) throw new Error(`Asset tag "${tag}" already exists`);
    const asset: Asset = {
      id: newId(input.kind.slice(0, 3)),
      kind: input.kind,
      name: input.name.trim(),
      tag,
      description: input.description?.trim() ?? "",
      notes: input.notes,
      refs: [],
      createdAt: t,
      updatedAt: t,
    };
    db.assets.push(asset);
    return asset;
  });
}

export async function updateAsset(pid: string, id: string, patch: Partial<Pick<Asset, "name" | "tag" | "description" | "notes" | "kind">>) {
  return mutate(pid, (db) => {
    const a = db.assets.find((x) => x.id === id);
    if (!a) throw new Error("asset not found");
    if (patch.tag !== undefined) {
      const tag = slugify(patch.tag);
      if (db.assets.some((x) => x.id !== id && x.tag === tag)) throw new Error(`Asset tag "${tag}" already exists`);
      a.tag = tag;
    }
    if (patch.name !== undefined) a.name = patch.name.trim();
    if (patch.description !== undefined) a.description = patch.description;
    if (patch.notes !== undefined) a.notes = patch.notes;
    if (patch.kind !== undefined) a.kind = patch.kind;
    a.updatedAt = nowIso();
    return a;
  });
}

export async function deleteAsset(pid: string, id: string) {
  await mutate(pid, (db) => {
    db.assets = db.assets.filter((a) => a.id !== id);
    for (const s of db.shots) s.assetIds = s.assetIds.filter((x) => x !== id);
    if (db.project.styleAssetId === id) db.project.styleAssetId = undefined;
    for (const sc of db.scenes) if (sc.locationId === id) sc.locationId = undefined;
  });
  await fsp.rm(path.join(refsDir(pid), id), { recursive: true, force: true });
}

export async function addRefFromBuffer(pid: string, assetId: string, buf: Buffer, ext: string, meta: { label?: string; useInVideo?: boolean; genPrompt?: string } = {}): Promise<RefImage> {
  ext = ext.toLowerCase().startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  if (ext === ".jpeg") ext = ".jpg";
  if (!IMAGE_EXT.has(ext)) throw new Error(`Unsupported image type ${ext}`);
  ensureProjectDirs(pid);
  const id = newId("ref");
  const file = `${id}${ext}`;
  await fsp.mkdir(path.join(refsDir(pid), assetId), { recursive: true });
  await fsp.writeFile(refPath(pid, assetId, file), buf);
  const ref: RefImage = { id, file, label: meta.label ?? "", useInVideo: meta.useInVideo ?? true, genPrompt: meta.genPrompt, createdAt: nowIso() };
  await mutate(pid, (db) => {
    const a = db.assets.find((x) => x.id === assetId);
    if (!a) throw new Error("asset not found");
    a.refs.push(ref);
    a.updatedAt = nowIso();
  });
  return ref;
}

export async function addRefFromPath(pid: string, assetId: string, localPath: string, meta: { label?: string; useInVideo?: boolean; genPrompt?: string } = {}) {
  const buf = await fsp.readFile(localPath);
  return addRefFromBuffer(pid, assetId, buf, path.extname(localPath), { label: path.basename(localPath, path.extname(localPath)), ...meta });
}

export async function addRefFromUrl(pid: string, assetId: string, url: string, meta: { label?: string; useInVideo?: boolean; genPrompt?: string } = {}) {
  if (url.startsWith("file://")) {
    const ref = await addRefFromPath(pid, assetId, url.slice(7), meta);
    await fsp.rm(url.slice(7), { force: true }).catch(() => {});
    return ref;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  const ext = ct.includes("png") ? ".png" : ct.includes("webp") ? ".webp" : ct.includes("jpeg") || ct.includes("jpg") ? ".jpg" : path.extname(new URL(url).pathname) || ".png";
  return addRefFromBuffer(pid, assetId, Buffer.from(await res.arrayBuffer()), ext, meta);
}

export async function updateRef(pid: string, assetId: string, refId: string, patch: Partial<Pick<RefImage, "label" | "useInVideo">>) {
  return mutate(pid, (db) => {
    const a = db.assets.find((x) => x.id === assetId);
    const r = a?.refs.find((x) => x.id === refId);
    if (!a || !r) throw new Error("ref not found");
    if (patch.label !== undefined) r.label = patch.label;
    if (patch.useInVideo !== undefined) r.useInVideo = patch.useInVideo;
    a.updatedAt = nowIso();
    return r;
  });
}

export async function deleteRef(pid: string, assetId: string, refId: string) {
  const file = await mutate(pid, (db) => {
    const a = db.assets.find((x) => x.id === assetId);
    if (!a) throw new Error("asset not found");
    const r = a.refs.find((x) => x.id === refId);
    a.refs = a.refs.filter((x) => x.id !== refId);
    a.updatedAt = nowIso();
    return r?.file;
  });
  if (file) await fsp.rm(refPath(pid, assetId, file), { force: true });
}

/**
 * Generate reference images for an asset with the project's image model (Seedream on fal)
 * and attach them as refs. Prompt = style + asset description + extra guidance.
 */
export async function generateRefs(
  pid: string,
  assetId: string,
  opts: { prompt?: string; n?: number; width?: number; height?: number; seed?: number; label?: string; useDescription?: boolean },
) {
  const db = getDb(pid);
  const a = db.assets.find((x) => x.id === assetId);
  if (!a) throw new Error("asset not found");
  const parts: string[] = [];
  if (db.project.stylePrompt) parts.push(db.project.stylePrompt);
  if (opts.useDescription !== false && a.description) parts.push(`${a.kind === "character" ? "Character design" : a.kind} of ${a.name}: ${a.description}`);
  if (opts.prompt) parts.push(opts.prompt);
  if (a.kind === "character" && !opts.prompt) parts.push("Full body, neutral pose, facing camera, plain flat background, clear view of face and outfit, character reference sheet quality.");
  const prompt = parts.join("\n");
  const images = await getImageProvider(db.project.provider).generateImages({
    model: db.project.imageModel,
    prompt,
    width: opts.width ?? 1024,
    height: opts.height ?? 1024,
    n: Math.max(1, Math.min(4, opts.n ?? 1)),
    seed: opts.seed,
  });
  const refs: RefImage[] = [];
  for (const [i, im] of images.entries()) {
    const label = opts.label ? (images.length > 1 ? `${opts.label} ${i + 1}` : opts.label) : `generated ${a.refs.length + i + 1}`;
    refs.push(await addRefFromUrl(pid, assetId, im.url, { label, genPrompt: prompt, useInVideo: true }));
  }
  return { prompt, refs };
}
