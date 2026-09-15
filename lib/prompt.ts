import type { Asset, Db, RefImage, Shot } from "./types";

export interface ResolvedRef {
  asset: Asset;
  ref: RefImage;
  imageIndex: number; // 1-based
}

export interface ResolvedPrompt {
  prompt: string;
  refs: ResolvedRef[];
  /** Assets referenced by the shot in order of first appearance. */
  assets: Asset[];
  warnings: string[];
}

const MAX_IMAGES = 9;

/** Find @tags in a prompt. Tags are [a-z0-9_]. "@Image3" style tokens are ignored. */
export function extractTags(prompt: string): string[] {
  const out: string[] = [];
  for (const m of prompt.matchAll(/@([a-z0-9_]+)/gi)) {
    const tag = m[1].toLowerCase();
    if (/^(image|video|audio)\d*$/.test(tag)) continue;
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

function kindLabel(a: Asset) {
  switch (a.kind) {
    case "character":
      return "character";
    case "location":
      return "location / background";
    case "style":
      return "art style";
    case "prop":
      return "prop";
  }
}

function lockText(a: Asset) {
  switch (a.kind) {
    case "character":
      return "Keep face, hair, eyes, outfit and proportions exactly as shown; do not redesign.";
    case "location":
      return "Match the layout, architecture, palette and lighting of this environment.";
    case "style":
      return "Match this art style, line quality and color palette throughout.";
    case "prop":
      return "Keep this object's shape, color and details unchanged.";
  }
}

/**
 * Build the final prompt sent to the model.
 * - Style prompt (project) comes first.
 * - A reference legend maps @ImageN to each asset, with a consistency lock.
 * - The shot prompt has @tag replaced by @ImageN (first ref of that asset).
 * - Suffix prompt last.
 */
export function resolvePrompt(db: Db, shot: Shot, scene?: { locationId?: string }): ResolvedPrompt {
  const warnings: string[] = [];
  const byTag = new Map(db.assets.map((a) => [a.tag, a]));
  const byId = new Map(db.assets.map((a) => [a.id, a]));

  // Ordered, de-duplicated list of assets: explicit ids, then @tags, then scene location, then style asset.
  const ordered: Asset[] = [];
  const push = (a?: Asset) => {
    if (a && !ordered.includes(a)) ordered.push(a);
  };
  for (const id of shot.assetIds) {
    const a = byId.get(id) ?? byTag.get(id);
    if (!a) warnings.push(`Unknown asset id "${id}"`);
    push(a);
  }
  for (const tag of extractTags(shot.prompt)) {
    const a = byTag.get(tag);
    if (!a) warnings.push(`@${tag} does not match any asset tag`);
    push(a);
  }
  if (scene?.locationId) push(byId.get(scene.locationId));
  if (db.project.styleAssetId) push(byId.get(db.project.styleAssetId));

  // Allocate image slots.
  const refs: ResolvedRef[] = [];
  const firstIndex = new Map<string, number>();
  const per = Math.max(1, db.project.maxRefsPerAsset);
  for (const a of ordered) {
    const usable = a.refs.filter((r) => r.useInVideo);
    if (!usable.length) {
      warnings.push(`${a.name} has no reference images marked for video use`);
      continue;
    }
    for (const r of usable.slice(0, per)) {
      if (refs.length >= MAX_IMAGES) {
        warnings.push(`Reference limit of ${MAX_IMAGES} images reached; dropping ${a.name}/${r.label}`);
        break;
      }
      const imageIndex = refs.length + 1;
      refs.push({ asset: a, ref: r, imageIndex });
      if (!firstIndex.has(a.id)) firstIndex.set(a.id, imageIndex);
    }
  }

  // Legend.
  const legendLines: string[] = [];
  for (const a of ordered) {
    const mine = refs.filter((r) => r.asset.id === a.id);
    if (!mine.length) continue;
    const slots = mine.map((r) => `@Image${r.imageIndex}`).join(" and ");
    const desc = a.description?.trim() ? ` ${a.description.trim().replace(/\s+/g, " ")}` : "";
    legendLines.push(`${slots} = ${a.name} (${kindLabel(a)}).${desc} ${lockText(a)}`);
  }

  // Replace @tags in the shot prompt.
  let body = shot.prompt.replace(/@([a-z0-9_]+)/gi, (m, t: string) => {
    const tag = t.toLowerCase();
    if (/^(image|video|audio)\d*$/.test(tag)) return m;
    const a = byTag.get(tag);
    const idx = a ? firstIndex.get(a.id) : undefined;
    if (!a) return m;
    return idx ? `${a.name} (@Image${idx})` : a.name;
  });
  body = body.trim();

  const parts: string[] = [];
  if (!shot.omitStyle && db.project.stylePrompt?.trim()) parts.push(db.project.stylePrompt.trim());
  if (legendLines.length) parts.push(legendLines.join("\n"));
  parts.push(body);
  if (db.project.suffixPrompt?.trim()) parts.push(db.project.suffixPrompt.trim());

  return { prompt: parts.join("\n\n"), refs, assets: ordered, warnings };
}
