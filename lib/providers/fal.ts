import fsp from "node:fs/promises";
import path from "node:path";
import { fal } from "@fal-ai/client";
import type { ImageProvider, PollStatus, SubmitResult, VideoProvider } from "./types";
import type { ModelFamily } from "../types";

// fal.ai hosts ByteDance's Seedance models. Endpoint reference:
// https://fal.ai/models/bytedance/seedance-2.0/reference-to-video

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set. Put it in .env.local (see .env.example).");
  fal.config({ credentials: key });
  configured = true;
}

const FAMILY_BASE: Record<ModelFamily, string> = {
  "seedance-2.0": "bytedance/seedance-2.0",
  "seedance-2.0-fast": "bytedance/seedance-2.0/fast",
  "seedance-2.5": "bytedance/seedance-2.5",
};

// Approx USD per output second (fal list price, Sept 2026). Adjust in one place.
const PER_SECOND: Record<ModelFamily, number> = {
  "seedance-2.0": 0.3024,
  "seedance-2.0-fast": 0.2419,
  "seedance-2.5": 0.3024,
};

export function falEndpoint(model: ModelFamily, hasRefs: boolean) {
  const base = FAMILY_BASE[model] ?? FAMILY_BASE["seedance-2.0"];
  return `${base}/${hasRefs ? "reference-to-video" : "text-to-video"}`;
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};
export function mimeFor(file: string) {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

export const falProvider: VideoProvider = {
  name: "fal",

  async uploadFile(localPath, contentType) {
    ensureConfigured();
    const buf = await fsp.readFile(localPath);
    const file = new File([new Uint8Array(buf)], path.basename(localPath), { type: contentType });
    return fal.storage.upload(file);
  },

  async submit(input): Promise<SubmitResult> {
    ensureConfigured();
    const hasRefs = input.imageUrls.length > 0;
    const endpoint = falEndpoint(input.model, hasRefs);
    const body: Record<string, unknown> = {
      prompt: input.prompt,
      resolution: input.resolution,
      duration: input.duration === "auto" ? "auto" : String(input.duration),
      aspect_ratio: input.aspectRatio,
      generate_audio: input.generateAudio,
    };
    if (hasRefs) body.image_urls = input.imageUrls;
    if (input.seed !== undefined) body.seed = input.seed;
    const { request_id } = await fal.queue.submit(endpoint, { input: body });
    return { requestId: request_id, endpoint };
  },

  async poll(endpoint, requestId): Promise<PollStatus> {
    ensureConfigured();
    const status = await fal.queue.status(endpoint, { requestId, logs: true });
    const logs = "logs" in status && Array.isArray(status.logs) ? status.logs.map((l) => l.message) : undefined;
    if (status.status === "IN_QUEUE") return { state: "queued", position: status.queue_position, logs };
    if (status.status === "IN_PROGRESS") return { state: "running", logs };
    // COMPLETED
    try {
      const result = await fal.queue.result(endpoint, { requestId });
      const data = result.data as { video?: { url?: string }; seed?: number };
      if (!data?.video?.url) return { state: "failed", error: "Completed without a video URL", logs };
      return { state: "done", videoUrl: data.video.url, seed: data.seed, logs };
    } catch (e) {
      return { state: "failed", error: describeError(e), logs };
    }
  },

  async cancel(endpoint, requestId) {
    ensureConfigured();
    await fal.queue.cancel(endpoint, { requestId });
  },

  estimateCost(input) {
    const secs = input.duration === "auto" ? 5 : input.duration;
    const mult = input.resolution === "1080p" ? 2.25 : input.resolution === "480p" ? 0.45 : 1;
    return +(PER_SECOND[input.model] * secs * mult).toFixed(2);
  },
};

export const falImages: ImageProvider = {
  async generateImages({ model, prompt, width, height, n, seed, referenceUrls }) {
    ensureConfigured();
    const input: Record<string, unknown> = {
      prompt,
      image_size: { width, height },
      num_images: n,
    };
    if (seed !== undefined) input.seed = seed;
    if (referenceUrls?.length) input.image_urls = referenceUrls;
    const result = await fal.subscribe(model, { input });
    const data = result.data as { images?: { url: string }[]; seed?: number };
    return (data.images ?? []).map((im) => ({ url: im.url, seed: data.seed }));
  },
};

export function describeError(e: unknown): string {
  if (e && typeof e === "object") {
    const anyE = e as { message?: string; body?: unknown; status?: number };
    const parts: string[] = [];
    if (anyE.status) parts.push(`HTTP ${anyE.status}`);
    if (anyE.message) parts.push(anyE.message);
    if (anyE.body) {
      try {
        parts.push(typeof anyE.body === "string" ? anyE.body : JSON.stringify(anyE.body));
      } catch {
        /* ignore */
      }
    }
    if (parts.length) return parts.join(": ");
  }
  return String(e);
}
