import { spawn } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import { OUTPUT_DIR, ensureDirs } from "../paths";
import type { GenerateInput, ImageProvider, PollStatus, SubmitResult, VideoProvider } from "./types";

// Free local provider for exercising the whole pipeline without spending credits.
// Renders a test-pattern mp4 with ffmpeg that shows the prompt and ref count.

type Job = { input: GenerateInput; startedAt: number; file?: string; error?: string; done: boolean };
type G = typeof globalThis & { __mockJobs?: Map<string, Job> };
const g = globalThis as G;
const jobs = () => (g.__mockJobs ??= new Map());

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`))));
  });
}

function esc(s: string) {
  // escape for ffmpeg drawtext
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/%/g, "%%");
}

async function render(id: string, input: GenerateInput) {
  ensureDirs();
  const secs = input.duration === "auto" ? 5 : input.duration;
  const [w, h] = input.aspectRatio === "9:16" ? [720, 1280] : input.aspectRatio === "1:1" ? [720, 720] : [1280, 720];
  const file = `mock_${id}.mp4`;
  const out = path.join(OUTPUT_DIR, file);
  const text = esc(input.prompt.slice(0, 90).replace(/\n/g, " "));
  const vf = [
    `drawtext=text='MOCK ${input.model} ${w}x${h} ${secs}s refs=${input.imageUrls.length}':fontsize=28:fontcolor=white:x=20:y=20:box=1:boxcolor=black@0.5`,
    `drawtext=text='${text}':fontsize=22:fontcolor=white:x=20:y=h-60:box=1:boxcolor=black@0.5`,
  ].join(",");
  await run("ffmpeg", [
    "-y", "-f", "lavfi", "-i", `testsrc2=size=${w}x${h}:rate=24`,
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-t", String(secs), "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out,
  ]);
  return file;
}

export const mockProvider: VideoProvider = {
  name: "mock",
  async uploadFile(localPath) {
    return `file://${localPath}`;
  },
  async submit(input): Promise<SubmitResult> {
    const id = `mock_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const job: Job = { input, startedAt: Date.now(), done: false };
    jobs().set(id, job);
    // simulate a 6s generation time
    setTimeout(() => {
      render(id, input)
        .then((file) => Object.assign(job, { file, done: true }))
        .catch((e) => Object.assign(job, { error: String(e), done: true }));
    }, 6000);
    return { requestId: id, endpoint: "mock" };
  },
  async poll(_endpoint, requestId): Promise<PollStatus> {
    const job = jobs().get(requestId);
    if (!job) return { state: "failed", error: "mock job lost (server restarted)" };
    if (!job.done) return Date.now() - job.startedAt < 3000 ? { state: "queued", position: 1 } : { state: "running" };
    if (job.error) return { state: "failed", error: job.error };
    return { state: "done", videoUrl: `mock://${job.file}`, seed: 42 };
  },
  estimateCost() {
    return 0;
  },
};

/** Mock "download": file is already in OUTPUT_DIR. */
export async function mockResolveLocal(videoUrl: string): Promise<string> {
  const file = videoUrl.replace("mock://", "");
  await fsp.access(path.join(OUTPUT_DIR, file));
  return file;
}

export const mockImages: ImageProvider = {
  async generateImages({ prompt, width, height, n }) {
    ensureDirs();
    const out: { url: string }[] = [];
    for (let i = 0; i < n; i++) {
      const file = `mockimg_${Date.now().toString(36)}_${i}.png`;
      const p = path.join(OUTPUT_DIR, file);
      await run("ffmpeg", [
        "-y", "-f", "lavfi", "-i", `testsrc2=size=${width}x${height}`, "-frames:v", "1",
        "-vf", `drawtext=text='${esc(prompt.slice(0, 60))}':fontsize=24:fontcolor=white:x=20:y=20:box=1:boxcolor=black@0.5`, p,
      ]);
      out.push({ url: `file://${p}` });
    }
    return out;
  },
};
