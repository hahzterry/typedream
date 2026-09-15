import fsp from "node:fs/promises";
import type { GenerateInput, PollStatus, SubmitResult, VideoProvider } from "./types";
import { mimeFor } from "./fal";

// BytePlus ModelArk (official ByteDance hosting). EXPERIMENTAL / untested.
// Docs: https://docs.byteplus.com/en/docs/ModelArk/1520757
// Env: ARK_API_KEY, ARK_BASE_URL (default ap-southeast), ARK_MODEL_* per family.

const BASE = () => (process.env.ARK_BASE_URL ?? "https://ark.ap-southeast.bytepluses.com/api/v3").replace(/\/$/, "");

function key() {
  const k = process.env.ARK_API_KEY;
  if (!k) throw new Error("ARK_API_KEY is not set.");
  return k;
}

function modelId(family: GenerateInput["model"]) {
  const env: Record<string, string | undefined> = {
    "seedance-2.0": process.env.ARK_MODEL_SEEDANCE_2_0,
    "seedance-2.0-fast": process.env.ARK_MODEL_SEEDANCE_2_0_FAST ?? process.env.ARK_MODEL_SEEDANCE_2_0,
    "seedance-2.5": process.env.ARK_MODEL_SEEDANCE_2_5,
  };
  const id = env[family];
  if (!id) throw new Error(`No ModelArk model id configured for ${family} (set ARK_MODEL_SEEDANCE_2_0 etc.)`);
  return id;
}

export const arkProvider: VideoProvider = {
  name: "ark",

  // Ark accepts base64 data URIs for images, so no separate upload step.
  async uploadFile(localPath, contentType) {
    const buf = await fsp.readFile(localPath);
    return `data:${contentType || mimeFor(localPath)};base64,${buf.toString("base64")}`;
  },

  async submit(input): Promise<SubmitResult> {
    const content: unknown[] = [{ type: "text", text: input.prompt }];
    for (const url of input.imageUrls) content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
    const body: Record<string, unknown> = {
      model: modelId(input.model),
      content,
      resolution: input.resolution,
      ratio: input.aspectRatio === "auto" ? "adaptive" : input.aspectRatio,
      generate_audio: input.generateAudio,
      watermark: false,
    };
    if (input.duration !== "auto") body.duration = input.duration;
    if (input.seed !== undefined) body.seed = input.seed;
    const res = await fetch(`${BASE()}/contents/generations/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Ark submit failed: HTTP ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { id: string };
    return { requestId: json.id, endpoint: "ark" };
  },

  async poll(_endpoint, requestId): Promise<PollStatus> {
    const res = await fetch(`${BASE()}/contents/generations/tasks/${requestId}`, {
      headers: { Authorization: `Bearer ${key()}` },
    });
    if (!res.ok) return { state: "failed", error: `Ark poll failed: HTTP ${res.status} ${await res.text()}` };
    const json = (await res.json()) as {
      status: string;
      content?: { video_url?: string };
      seed?: number;
      error?: { message?: string };
    };
    switch (json.status) {
      case "queued":
        return { state: "queued" };
      case "running":
        return { state: "running" };
      case "succeeded":
        return json.content?.video_url
          ? { state: "done", videoUrl: json.content.video_url, seed: json.seed }
          : { state: "failed", error: "succeeded without video_url" };
      case "cancelled":
        return { state: "failed", error: "cancelled" };
      default:
        return { state: "failed", error: json.error?.message ?? `status=${json.status}` };
    }
  },

  async cancel(_endpoint, requestId) {
    await fetch(`${BASE()}/contents/generations/tasks/${requestId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key()}` },
    });
  },
};
