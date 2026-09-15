import type { AspectRatio, ModelFamily, ProviderName, Resolution } from "../types";

export interface GenerateInput {
  model: ModelFamily;
  prompt: string;
  /** Public URLs, ordered: index 0 == @Image1 */
  imageUrls: string[];
  duration: number | "auto";
  aspectRatio: AspectRatio;
  resolution: Resolution;
  generateAudio: boolean;
  seed?: number;
}

export interface SubmitResult {
  requestId: string;
  endpoint: string;
}

export type PollStatus =
  | { state: "queued"; position?: number; logs?: string[] }
  | { state: "running"; logs?: string[] }
  | { state: "done"; videoUrl: string; seed?: number; logs?: string[] }
  | { state: "failed"; error: string; logs?: string[] };

export interface VideoProvider {
  name: ProviderName;
  /** Upload a local file and return a URL the provider can read. */
  uploadFile(localPath: string, contentType: string): Promise<string>;
  submit(input: GenerateInput): Promise<SubmitResult>;
  poll(endpoint: string, requestId: string): Promise<PollStatus>;
  cancel?(endpoint: string, requestId: string): Promise<void>;
  /** Rough USD estimate for a generation, or undefined if unknown. */
  estimateCost?(input: GenerateInput): number | undefined;
}

export interface ImageProvider {
  generateImages(opts: {
    model: string;
    prompt: string;
    width: number;
    height: number;
    n: number;
    seed?: number;
    referenceUrls?: string[];
  }): Promise<{ url: string; seed?: number }[]>;
}
