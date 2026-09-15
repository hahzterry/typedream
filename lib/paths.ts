import path from "node:path";
import fs from "node:fs";

/** Root of on-disk state. Override with TYPEDREAM_DATA_DIR. */
export const DATA_DIR = path.resolve(process.env.TYPEDREAM_DATA_DIR ?? path.join(process.cwd(), "data"));
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const TMP_DIR = path.join(DATA_DIR, "tmp");
export const CURRENT_FILE = path.join(DATA_DIR, "current.json");

const SAFE_ID = /^[a-z0-9_-]+$/;
export function assertId(id: string) {
  if (!SAFE_ID.test(id)) throw new Error(`invalid id "${id}"`);
  return id;
}

export function projectDir(pid: string) {
  return path.join(PROJECTS_DIR, assertId(pid));
}
export function dbFile(pid: string) {
  return path.join(projectDir(pid), "db.json");
}
export function refsDir(pid: string) {
  return path.join(projectDir(pid), "refs");
}
export function outputDir(pid: string) {
  return path.join(projectDir(pid), "output");
}
export function assemblyDir(pid: string) {
  return path.join(projectDir(pid), "assembly");
}
export function refPath(pid: string, assetId: string, file: string) {
  return path.join(refsDir(pid), assetId, file);
}
export function outputPath(pid: string, file: string) {
  return path.join(outputDir(pid), file);
}

export function ensureRoot() {
  for (const d of [DATA_DIR, PROJECTS_DIR, TMP_DIR]) fs.mkdirSync(d, { recursive: true });
}
export function ensureProjectDirs(pid: string) {
  ensureRoot();
  for (const d of [projectDir(pid), refsDir(pid), outputDir(pid), assemblyDir(pid)]) fs.mkdirSync(d, { recursive: true });
}

/** URL under which the web app serves a project file. */
export function fileUrl(pid: string, ...segments: string[]) {
  return `/api/projects/${pid}/files/` + segments.map(encodeURIComponent).join("/");
}
