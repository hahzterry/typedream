"use client";

import { useState } from "react";
import { useHarness } from "./HarnessProvider";
import { Button, ErrorLine, Field, Modal } from "./ui";
import type { AspectRatio, ModelFamily, Resolution, Shot } from "@/lib/types";

const RATIOS: AspectRatio[] = ["auto", "16:9", "21:9", "4:3", "1:1", "3:4", "9:16"];
const RES: Resolution[] = ["480p", "720p", "1080p"];
const MODELS: ModelFamily[] = ["seedance-2.0", "seedance-2.0-fast", "seedance-2.5"];

export function ShotEditor({ open, onClose, shot, sceneId }: { open: boolean; onClose: () => void; shot?: Shot; sceneId?: string }) {
  const { api, state } = useHarness();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<string>("auto");
  const [ratio, setRatio] = useState<string>("");
  const [res, setRes] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [audio, setAudio] = useState<string>("");
  const [seed, setSeed] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [scene, setScene] = useState(sceneId ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState<string | undefined>();

  const formKey = open ? `${shot?.id ?? "new"}:${sceneId ?? ""}` : undefined;
  if (formKey !== key) {
    setKey(formKey);
    setTitle(shot?.title ?? "");
    setPrompt(shot?.prompt ?? "");
    setDuration(String(shot?.duration ?? "auto"));
    setRatio(shot?.aspectRatio ?? "");
    setRes(shot?.resolution ?? "");
    setModel(shot?.model ?? "");
    setAudio(shot?.generateAudio === undefined ? "" : String(shot.generateAudio));
    setSeed(shot?.seed?.toString() ?? "");
    setNotes(shot?.notes ?? "");
    setScene(shot?.sceneId ?? sceneId ?? state?.scenes[0]?.id ?? "");
    setErr(null);
  }

  const tags = state?.assets ?? [];

  async function save() {
    setErr(null);
    const body = {
      sceneId: scene,
      title,
      prompt,
      duration: duration === "auto" ? "auto" : Number(duration),
      aspectRatio: ratio || undefined,
      resolution: res || undefined,
      model: model || undefined,
      generateAudio: audio === "" ? undefined : audio === "true",
      seed: seed ? Number(seed) : undefined,
      notes: notes || undefined,
    };
    try {
      if (shot) await api(`/shots/${shot.id}`, { method: "PATCH", body });
      else await api("/shots", { body });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={shot ? `Edit shot: ${shot.title}` : "New shot"} wide>
      <div className="grid gap-4">
        <div className="grid md:grid-cols-[1fr_220px] gap-3">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="1A — Aki at the fence" autoFocus />
          </Field>
          <Field label="Scene">
            <select value={scene} onChange={(e) => setScene(e.target.value)}>
              {state?.scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Prompt — action · camera · dialogue" hint="Reference assets with @tag; they become @ImageN references automatically.">
          <textarea rows={8} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Medium shot. @aki leans on the fence, wind in her hair, looks toward the skyline and smiles. Slow push-in. She says softly: 'Finally.'" />
        </Field>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 -mt-2">
            {tags.map((a) => (
              <button
                key={a.id}
                type="button"
                className="text-xs mono px-1.5 py-0.5 rounded border border-line-2 text-fg-2 hover:border-accent hover:text-accent-2"
                onClick={() => setPrompt((p) => (p.endsWith(" ") || p === "" ? p : p + " ") + `@${a.tag} `)}
                title={a.description}
              >
                @{a.tag}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Field label="Duration">
            <select value={duration} onChange={(e) => setDuration(e.target.value)}>
              <option value="auto">auto</option>
              {Array.from({ length: 12 }, (_, i) => i + 4).map((n) => (
                <option key={n} value={n}>
                  {n}s
                </option>
              ))}
              {[20, 25, 30].map((n) => (
                <option key={n} value={n}>
                  {n}s (2.5 only)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Aspect">
            <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
              <option value="">project ({state?.project.aspectRatio})</option>
              {RATIOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Resolution">
            <select value={res} onChange={(e) => setRes(e.target.value)}>
              <option value="">project ({state?.project.resolution})</option>
              {RES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model">
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="">project ({state?.project.model})</option>
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Audio">
            <select value={audio} onChange={(e) => setAudio(e.target.value)}>
              <option value="">project</option>
              <option value="true">on</option>
              <option value="false">off</option>
            </select>
          </Field>
          <Field label="Seed">
            <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="random" />
          </Field>
        </div>
        <Field label="Director notes (not sent to model)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <ErrorLine error={err} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!title.trim() || !prompt.trim() || !scene}>
            {shot ? "Save" : "Create shot"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
