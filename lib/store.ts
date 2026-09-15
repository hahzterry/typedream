import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { newId, nowIso, slugify } from "./ids";
import { CURRENT_FILE, PROJECTS_DIR, dbFile, ensureProjectDirs, ensureRoot, projectDir } from "./paths";
import type { Db, Project, ProjectSummary } from "./types";

// One JSON document per project with serialized writes.
// The Next.js server is the only writer; the CLI talks to it over HTTP.

export class NotFound extends Error {
  status = 404;
}

export function defaultProjectFields(): Omit<Project, "id" | "name" | "description" | "createdAt" | "updatedAt"> {
  return {
    stylePrompt:
      "2D anime, hand-drawn cel-shaded look, clean line art, flat colors with soft shading, expressive faces, cinematic lighting, high-detail background painting, consistent character design.",
    suffixPrompt: "No subtitles, no captions, no watermark, no text overlays.",
    provider: (process.env.TYPEDREAM_PROVIDER as Project["provider"]) || "fal",
    model: "seedance-2.0",
    aspectRatio: "16:9",
    resolution: "720p",
    generateAudio: true,
    maxRefsPerAsset: 2,
    imageModel: process.env.IMAGE_MODEL || "fal-ai/bytedance/seedream/v4/text-to-image",
  };
}

type G = typeof globalThis & { __td?: { cache: Map<string, Db>; locks: Map<string, Promise<unknown>> } };
const g = globalThis as G;
const S = () => (g.__td ??= { cache: new Map(), locks: new Map() });

function load(pid: string): Db {
  const s = S();
  const hit = s.cache.get(pid);
  if (hit) return hit;
  const file = dbFile(pid);
  if (!fs.existsSync(file)) throw new NotFound(`project "${pid}" not found`);
  const db = JSON.parse(fs.readFileSync(file, "utf8")) as Db;
  db.project = { ...defaultProjectFields(), ...db.project, id: pid };
  s.cache.set(pid, db);
  return db;
}

async function persist(pid: string, db: Db) {
  ensureProjectDirs(pid);
  const file = dbFile(pid);
  const tmp = path.join(path.dirname(file), `.db.${process.pid}.${Date.now()}.tmp`);
  await fsp.writeFile(tmp, JSON.stringify(db, null, 2));
  await fsp.rename(tmp, file);
}

/** Read-only snapshot. Do not mutate the result. */
export function getDb(pid: string): Db {
  return load(pid);
}

/** Run a serialized mutation against a project's db and persist it. */
export async function mutate<T>(pid: string, fn: (db: Db) => T | Promise<T>): Promise<T> {
  const s = S();
  const prev = s.locks.get(pid) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  s.locks.set(pid, prev.then(() => mine));
  await prev;
  try {
    const db = load(pid);
    const result = await fn(db);
    db.project.updatedAt = nowIso();
    await persist(pid, db);
    return result;
  } finally {
    release();
  }
}

// ---- projects ----

export function listProjectIds(): string[] {
  ensureRoot();
  return fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(PROJECTS_DIR, d.name, "db.json")))
    .map((d) => d.name);
}

export function summarize(db: Db): ProjectSummary {
  return {
    id: db.project.id,
    name: db.project.name,
    description: db.project.description,
    provider: db.project.provider,
    model: db.project.model,
    assets: db.assets.length,
    scenes: db.scenes.length,
    shots: db.shots.length,
    takesDone: db.takes.filter((t) => t.status === "done").length,
    takesActive: db.takes.filter((t) => t.status === "queued" || t.status === "running").length,
    createdAt: db.project.createdAt,
    updatedAt: db.project.updatedAt,
  };
}

export function listProjects(): ProjectSummary[] {
  return listProjectIds()
    .map((id) => summarize(load(id)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createProject(input: { name: string; description?: string } & Partial<Project>): Promise<Project> {
  ensureRoot();
  const base = slugify(input.name) || "project";
  let id = base;
  for (let i = 2; fs.existsSync(projectDir(id)); i++) id = `${base}_${i}`;
  if (id.length < 3) id = `${id}_${newId("", 4).slice(1)}`;
  const t = nowIso();
  const { name, description, ...rest } = input;
  const project: Project = {
    ...defaultProjectFields(),
    ...stripUndefined(rest),
    id,
    name: name.trim(),
    description: (description ?? "").trim(),
    createdAt: t,
    updatedAt: t,
  };
  const db: Db = { version: 1, project, assets: [], scenes: [], shots: [], takes: [] };
  await persist(id, db);
  S().cache.set(id, db);
  return project;
}

export async function deleteProject(pid: string) {
  const dir = projectDir(pid);
  S().cache.delete(pid);
  await fsp.rm(dir, { recursive: true, force: true });
  if (getCurrentProject() === pid) await setCurrentProject(undefined);
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// ---- "current project" for the CLI ----

export function getCurrentProject(): string | undefined {
  try {
    const { id } = JSON.parse(fs.readFileSync(CURRENT_FILE, "utf8"));
    return typeof id === "string" && fs.existsSync(dbFile(id)) ? id : undefined;
  } catch {
    return undefined;
  }
}

export async function setCurrentProject(id: string | undefined) {
  ensureRoot();
  if (id) load(id); // validate
  await fsp.writeFile(CURRENT_FILE, JSON.stringify({ id: id ?? null }));
}

// ---- lookup helpers ----

export function findAsset(db: Db, idOrTag: string) {
  return db.assets.find((a) => a.id === idOrTag || a.tag === idOrTag || a.name.toLowerCase() === idOrTag.toLowerCase());
}
export function findScene(db: Db, idOrTitle: string) {
  return db.scenes.find((s) => s.id === idOrTitle || s.title.toLowerCase() === idOrTitle.toLowerCase());
}
export function takesForShot(db: Db, shotId: string) {
  return db.takes.filter((t) => t.shotId === shotId).sort((a, b) => a.n - b.n);
}
