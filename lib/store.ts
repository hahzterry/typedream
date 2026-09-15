import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { DB_FILE, ensureDirs } from "./paths";
import { nowIso } from "./ids";
import type { Db, Project } from "./types";

// Single-process JSON store with serialized writes.
// The Next.js server is the only writer; the CLI talks to it over HTTP.

function defaultProject(): Project {
  const t = nowIso();
  return {
    name: "Untitled Anime",
    stylePrompt:
      "2D anime, hand-drawn cel-shaded look, clean line art, flat colors with soft shading, expressive faces, cinematic lighting, high-detail background painting, consistent character design.",
    suffixPrompt: "No subtitles, no captions, no watermark, no text overlays.",
    provider: (process.env.HARNESS_PROVIDER as Project["provider"]) || "fal",
    model: "seedance-2.0",
    aspectRatio: "16:9",
    resolution: "720p",
    generateAudio: true,
    maxRefsPerAsset: 2,
    imageModel: process.env.IMAGE_MODEL || "fal-ai/bytedance/seedream/v4/text-to-image",
    createdAt: t,
    updatedAt: t,
  };
}

function emptyDb(): Db {
  return { version: 1, project: defaultProject(), assets: [], scenes: [], shots: [], takes: [] };
}

type G = typeof globalThis & { __harnessDb?: Db; __harnessLock?: Promise<unknown> };
const g = globalThis as G;

function load(): Db {
  if (g.__harnessDb) return g.__harnessDb;
  ensureDirs();
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(raw) as Db;
    db.project = { ...defaultProject(), ...db.project };
    g.__harnessDb = db;
  } else {
    g.__harnessDb = emptyDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(g.__harnessDb, null, 2));
  }
  return g.__harnessDb;
}

async function persist(db: Db) {
  ensureDirs();
  const tmp = path.join(path.dirname(DB_FILE), `.db.${process.pid}.${Date.now()}.tmp`);
  await fsp.writeFile(tmp, JSON.stringify(db, null, 2));
  await fsp.rename(tmp, DB_FILE);
}

/** Read-only snapshot. Do not mutate the result. */
export function getDb(): Db {
  return load();
}

/**
 * Run a mutation against the db. Mutations are serialized; the db is persisted
 * after each one. Return value of `fn` is passed through.
 */
export async function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const prev = g.__harnessLock ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  g.__harnessLock = prev.then(() => mine);
  await prev;
  try {
    const db = load();
    const result = await fn(db);
    db.project.updatedAt = nowIso();
    await persist(db);
    return result;
  } finally {
    release();
  }
}

// ---- lookup helpers ----

export function findAsset(db: Db, idOrTag: string) {
  return db.assets.find((a) => a.id === idOrTag || a.tag === idOrTag || a.name.toLowerCase() === idOrTag.toLowerCase());
}
export function findScene(db: Db, idOrTitle: string) {
  return db.scenes.find((s) => s.id === idOrTitle || s.title.toLowerCase() === idOrTitle.toLowerCase());
}
export function findShot(db: Db, id: string) {
  return db.shots.find((s) => s.id === id);
}
export function findTake(db: Db, id: string) {
  return db.takes.find((t) => t.id === id);
}
export function takesForShot(db: Db, shotId: string) {
  return db.takes.filter((t) => t.shotId === shotId).sort((a, b) => a.n - b.n);
}
