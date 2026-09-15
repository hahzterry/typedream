import type { ProviderName } from "../types";
import { arkProvider } from "./ark";
import { falImages, falProvider } from "./fal";
import { mockImages, mockProvider } from "./mock";
import type { ImageProvider, VideoProvider } from "./types";

export function getVideoProvider(name: ProviderName): VideoProvider {
  switch (name) {
    case "fal":
      return falProvider;
    case "ark":
      return arkProvider;
    case "mock":
      return mockProvider;
    default:
      throw new Error(`Unknown provider ${name}`);
  }
}

/** Image generation always goes through fal (Seedream) unless the project is in mock mode. */
export function getImageProvider(name: ProviderName): ImageProvider {
  return name === "mock" ? mockImages : falImages;
}

export type { VideoProvider, ImageProvider } from "./types";
