"use client";

import { useState } from "react";
import { useHarness } from "./HarnessProvider";
import { Button, ErrorLine, Field } from "./ui";
import type { Project } from "@/lib/types";

export function SettingsPage() {
  const { state, api } = useHarness();
  const [draft, setDraft] = useState<Partial<Project> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!state) return <div className="text-fg-3">Loading…</div>;
  const p = { ...state.project, ...draft };
  const set = <K extends keyof Project>(k: K, v: Project[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const styleAssets = state.assets.filter((a) => a.kind === "style");

  async function save() {
    setErr(null);
    try {
      await api("/api/project", { method: "PATCH", body: draft });
      setDraft(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid gap-5 max-w-3xl">
      <h1 className="text-lg font-semibold">Project settings</h1>
      <div className="bg-bg-2 border border-line rounded-lg p-5 grid gap-4">
        <Field label="Project name">
          <input value={p.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Style prompt (prepended to every shot)" hint="Describe the anime look once: line quality, shading, palette, era, studio feel, lens/film qualities.">
          <textarea rows={4} value={p.stylePrompt} onChange={(e) => set("stylePrompt", e.target.value)} />
        </Field>
        <Field label="Suffix prompt (appended to every shot)">
          <textarea rows={2} value={p.suffixPrompt ?? ""} onChange={(e) => set("suffixPrompt", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Provider">
            <select value={p.provider} onChange={(e) => set("provider", e.target.value as Project["provider"])}>
              <option value="fal">fal.ai {state.env.falKey ? "" : "(no key)"}</option>
              <option value="ark">BytePlus ModelArk {state.env.arkKey ? "" : "(no key)"}</option>
              <option value="mock">mock (free, local)</option>
            </select>
          </Field>
          <Field label="Model">
            <select value={p.model} onChange={(e) => set("model", e.target.value as Project["model"])}>
              <option value="seedance-2.0">seedance-2.0</option>
              <option value="seedance-2.0-fast">seedance-2.0-fast</option>
              <option value="seedance-2.5">seedance-2.5</option>
            </select>
          </Field>
          <Field label="Aspect ratio">
            <select value={p.aspectRatio} onChange={(e) => set("aspectRatio", e.target.value as Project["aspectRatio"])}>
              {["16:9", "21:9", "4:3", "1:1", "3:4", "9:16", "auto"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Resolution">
            <select value={p.resolution} onChange={(e) => set("resolution", e.target.value as Project["resolution"])}>
              {["480p", "720p", "1080p"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Generate audio">
            <select value={String(p.generateAudio)} onChange={(e) => set("generateAudio", e.target.value === "true")}>
              <option value="true">on (dialogue, SFX, music)</option>
              <option value="false">off</option>
            </select>
          </Field>
          <Field label="Max refs per asset per shot" hint="9 images max per generation overall.">
            <select value={p.maxRefsPerAsset} onChange={(e) => set("maxRefsPerAsset", Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Global style reference asset">
            <select value={p.styleAssetId ?? ""} onChange={(e) => set("styleAssetId", e.target.value || undefined)}>
              <option value="">none</option>
              {styleAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Image model (fal endpoint for reference image generation)">
          <input className="mono" value={p.imageModel} onChange={(e) => set("imageModel", e.target.value)} />
        </Field>
        <ErrorLine error={err} />
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={save} disabled={!draft}>
            Save
          </Button>
          {draft && (
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Discard
            </Button>
          )}
          {saved && <span className="text-ok text-sm">Saved</span>}
        </div>
      </div>
      <div className="text-xs text-fg-3 grid gap-1">
        <div>
          Keys are read from <span className="mono">.env.local</span>: FAL_KEY {state.env.falKey ? "✓" : "✗"}, ARK_API_KEY {state.env.arkKey ? "✓" : "✗"}. Restart the dev server after changing them.
        </div>
        <div>Data dir: ./data (db.json, refs/, output/, assembly/).</div>
      </div>
    </div>
  );
}
