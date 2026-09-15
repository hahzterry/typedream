import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { assemblyDir, ensureProjectDirs, outputDir } from "./paths";
import { getDb } from "./store";

function run(cmd: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-600)}`))));
  });
}

/** Ordered shots with a selected, finished take. */
export function assemblyPlan(pid: string, sceneIds?: string[]) {
  const db = getDb(pid);
  const scenes = [...db.scenes].sort((a, b) => a.order - b.order).filter((s) => !sceneIds || sceneIds.includes(s.id));
  const items: { shotId: string; title: string; file?: string; missing: boolean }[] = [];
  for (const sc of scenes) {
    for (const s of db.shots.filter((x) => x.sceneId === sc.id).sort((a, b) => a.order - b.order)) {
      const take = db.takes.find((t) => t.id === s.selectedTakeId && t.status === "done" && t.videoFile);
      items.push({ shotId: s.id, title: `${sc.title} / ${s.title}`, file: take?.videoFile, missing: !take });
    }
  }
  return items;
}

/** Concatenate selected takes into one mp4 (re-encoded so mixed sizes/fps work). */
export async function assemble(pid: string, opts: { sceneIds?: string[]; name?: string; skipMissing?: boolean } = {}) {
  ensureProjectDirs(pid);
  const plan = assemblyPlan(pid, opts.sceneIds);
  const missing = plan.filter((p) => p.missing);
  if (missing.length && !opts.skipMissing) throw new Error(`Shots without a finished selected take: ${missing.map((m) => m.title).join(", ")}`);
  const files = plan.filter((p) => p.file).map((p) => path.join(outputDir(pid), p.file!));
  if (!files.length) throw new Error("Nothing to assemble");

  const db = getDb(pid);
  const [w, h] = db.project.aspectRatio === "9:16" ? [1080, 1920] : db.project.aspectRatio === "1:1" ? [1080, 1080] : [1920, 1080];
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = `${(opts.name ?? db.project.name).replace(/[^a-z0-9_-]+/gi, "_")}_${stamp}.mp4`;
  const out = path.join(assemblyDir(pid), name);

  const args: string[] = ["-y"];
  for (const f of files) args.push("-i", f);
  const chains: string[] = [];
  const labels: string[] = [];
  files.forEach((_, i) => {
    chains.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p[v${i}]`);
    chains.push(`[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${i}]`);
    labels.push(`[v${i}][a${i}]`);
  });
  chains.push(`${labels.join("")}concat=n=${files.length}:v=1:a=1[outv][outa]`);
  args.push("-filter_complex", chains.join(";"), "-map", "[outv]", "-map", "[outa]", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", out);
  await run("ffmpeg", args);
  await fsp.access(out);
  return { file: name, shots: plan.filter((p) => p.file).map((p) => p.shotId), skipped: missing.map((m) => m.shotId) };
}

export async function listAssemblies(pid: string) {
  ensureProjectDirs(pid);
  const dir = assemblyDir(pid);
  const names = (await fsp.readdir(dir)).filter((n) => n.endsWith(".mp4"));
  const out = [];
  for (const n of names) {
    const st = await fsp.stat(path.join(dir, n));
    out.push({ file: n, size: st.size, createdAt: st.mtime.toISOString() });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
