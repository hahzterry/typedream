import path from "node:path";
import fs from "node:fs";

/** Root of on-disk state. Override with HARNESS_DATA_DIR. */
export const DATA_DIR = path.resolve(process.env.HARNESS_DATA_DIR ?? path.join(process.cwd(), "data"));
export const REFS_DIR = path.join(DATA_DIR, "refs");
export const OUTPUT_DIR = path.join(DATA_DIR, "output");
export const ASSEMBLY_DIR = path.join(DATA_DIR, "assembly");
export const DB_FILE = path.join(DATA_DIR, "db.json");

export function ensureDirs() {
  for (const d of [DATA_DIR, REFS_DIR, OUTPUT_DIR, ASSEMBLY_DIR]) fs.mkdirSync(d, { recursive: true });
}

export function refPath(assetId: string, file: string) {
  return path.join(REFS_DIR, assetId, file);
}

export function outputPath(file: string) {
  return path.join(OUTPUT_DIR, file);
}

/** URL under which the web app serves a file from DATA_DIR. */
export function fileUrl(...segments: string[]) {
  return "/api/files/" + segments.map(encodeURIComponent).join("/");
}

export function refUrl(assetId: string, file: string) {
  return fileUrl("refs", assetId, file);
}

export function outputUrl(file: string) {
  return fileUrl("output", file);
}
