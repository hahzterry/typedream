"use client";

import { useHarness } from "./HarnessProvider";
import type { Take } from "@/lib/types";

export function VideoPlayer({ take, className = "", autoPlay }: { take?: Take; className?: string; autoPlay?: boolean }) {
  const { outputUrl } = useHarness();
  if (!take?.videoFile) return null;
  return <video key={take.id} src={outputUrl(take.videoFile)} controls loop muted={!!autoPlay} autoPlay={autoPlay} playsInline preload="metadata" className={`w-full bg-black rounded-lg ${className}`} />;
}
