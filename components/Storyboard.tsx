"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { outputUrl, refUrl, useHarness } from "./HarnessProvider";
import { ShotEditor } from "./ShotEditor";
import { Button, Chip, Empty, ErrorLine, Field, Modal, StatusBadge, fmtCost, fmtDuration } from "./ui";
import type { Scene, Shot, Take } from "@/lib/types";

export function Storyboard() {
  const { state, api, busy } = useHarness();
  const [editing, setEditing] = useState<{ shot?: Shot; sceneId?: string } | null>(null);
  const [sceneModal, setSceneModal] = useState<Scene | "new" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const scenes = useMemo(() => [...(state?.scenes ?? [])].sort((a, b) => a.order - b.order), [state]);
  if (!state) return <div className="text-fg-3">Loading…</div>;

  const shotsByScene = (id: string) => state.shots.filter((s) => s.sceneId === id).sort((a, b) => a.order - b.order);
  const takesFor = (id: string) => state.takes.filter((t) => t.shotId === id).sort((a, b) => a.n - b.n);
  const drafts = state.shots.filter((s) => !state.takes.some((t) => t.shotId === s.id && t.status !== "failed" && t.status !== "cancelled"));

  async function run(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Storyboard</h1>
        <span className="text-fg-3 text-sm">
          {scenes.length} scenes · {state.shots.length} shots · {state.takes.filter((t) => t.status === "done").length} finished takes
        </span>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setSceneModal("new")}>+ Scene</Button>
          <Button onClick={() => setEditing({ sceneId: scenes[0]?.id })} disabled={!scenes.length}>
            + Shot
          </Button>
          <Button
            variant="primary"
            disabled={busy || !drafts.length}
            title={drafts.map((d) => d.title).join("\n")}
            onClick={() => run(() => api("/api/generate", { body: { onlyDraft: true } }))}
          >
            Generate {drafts.length} draft{drafts.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
      <ErrorLine error={err} />

      {!scenes.length && (
        <Empty>
          No scenes yet. Add a scene, then shots. Or let the director import a script via <code className="mono">npm run h -- import script.json</code>.
        </Empty>
      )}

      {scenes.map((scene) => {
        const shots = shotsByScene(scene.id);
        const loc = scene.locationId ? state.assets.find((a) => a.id === scene.locationId) : undefined;
        return (
          <section key={scene.id} className="grid gap-3">
            <div className="flex items-center gap-3 border-b border-line pb-2">
              <span className="mono text-fg-3 text-xs">S{scene.order}</span>
              <h2 className="font-semibold">{scene.title}</h2>
              {loc && <Chip>📍 {loc.name}</Chip>}
              {scene.description && <span className="text-fg-3 text-sm truncate max-w-xl">{scene.description}</span>}
              <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ sceneId: scene.id })}>
                  + shot
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSceneModal(scene)}>
                  edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || !shots.length}
                  onClick={() => run(() => api("/api/generate", { body: { sceneId: scene.id, onlyDraft: true } }))}
                >
                  generate drafts
                </Button>
              </div>
            </div>
            {!shots.length && <div className="text-fg-3 text-sm pl-1">No shots in this scene.</div>}
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shots.map((shot, i) => (
                <ShotCard
                  key={shot.id}
                  shot={shot}
                  index={i + 1}
                  takes={takesFor(shot.id)}
                  onEdit={() => setEditing({ shot })}
                  onGenerate={() => run(() => api(`/api/shots/${shot.id}/generate`, { body: {} }))}
                  onMove={(dir) => {
                    const ids = shots.map((s) => s.id);
                    const j = i + dir;
                    if (j < 0 || j >= ids.length) return;
                    [ids[i], ids[j]] = [ids[j], ids[i]];
                    run(() => api(`/api/scenes/${scene.id}`, { method: "PATCH", body: { shotOrder: ids } }));
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}

      <ShotEditor open={!!editing} onClose={() => setEditing(null)} shot={editing?.shot} sceneId={editing?.sceneId} />
      <SceneEditor scene={sceneModal === "new" ? undefined : sceneModal ?? undefined} open={!!sceneModal} onClose={() => setSceneModal(null)} />
    </div>
  );
}

function ShotCard({ shot, index, takes, onEdit, onGenerate, onMove }: { shot: Shot; index: number; takes: Take[]; onEdit: () => void; onGenerate: () => void; onMove: (d: -1 | 1) => void }) {
  const { state, busy } = useHarness();
  const selected = takes.find((t) => t.id === shot.selectedTakeId);
  const latest = takes[takes.length - 1];
  const status = selected?.status === "done" ? "done" : latest?.status ?? "draft";
  const active = takes.filter((t) => t.status === "queued" || t.status === "running");
  const assets = (state?.assets ?? []).filter((a) => shot.assetIds.includes(a.id) || new RegExp(`@${a.tag}\\b`, "i").test(shot.prompt));

  return (
    <div className="bg-bg-2 border border-line rounded-lg overflow-hidden flex flex-col group">
      <Link href={`/shots/${shot.id}`} className="block relative aspect-video bg-black">
        {selected?.videoFile ? (
          <video src={outputUrl(selected.videoFile)} muted loop playsInline preload="metadata" className="w-full h-full object-contain" onMouseEnter={(e) => e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-fg-3 text-xs">
            {active.length ? (
              <span className="flex items-center gap-2 text-warn">
                <span className="w-2 h-2 rounded-full bg-warn pulse" /> {active[0].status} {fmtDuration(active[0].createdAt)}
              </span>
            ) : latest?.status === "failed" ? (
              <span className="text-err px-3 text-center line-clamp-3">{latest.error}</span>
            ) : (
              "no take yet"
            )}
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 flex gap-1">
          <span className="mono text-[10px] bg-black/70 px-1.5 py-0.5 rounded text-fg-2">#{index}</span>
        </div>
        <div className="absolute top-1.5 right-1.5">
          <StatusBadge status={status} />
        </div>
        {assets.length > 0 && (
          <div className="absolute bottom-1.5 left-1.5 flex -space-x-1.5">
            {assets.slice(0, 5).map((a) => {
              const r = a.refs.find((x) => x.useInVideo) ?? a.refs[0];
              return r ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.id} src={refUrl(a.id, r.file)} alt={a.name} title={a.name} className="w-6 h-6 rounded-full object-cover border border-bg" />
              ) : (
                <span key={a.id} className="w-6 h-6 rounded-full bg-bg-3 border border-bg text-[9px] flex items-center justify-center" title={a.name}>
                  {a.name[0]}
                </span>
              );
            })}
          </div>
        )}
      </Link>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start gap-2">
          <Link href={`/shots/${shot.id}`} className="font-medium hover:text-accent-2 leading-tight">
            {shot.title}
          </Link>
          <span className="ml-auto mono text-[11px] text-fg-3 whitespace-nowrap">
            {shot.duration === "auto" ? "auto" : `${shot.duration}s`} · {takes.length} take{takes.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="text-xs text-fg-2 line-clamp-3 whitespace-pre-line">{shot.prompt}</p>
        <div className="mt-auto flex items-center gap-1 pt-1">
          <Button size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button size="sm" variant="primary" onClick={onGenerate} disabled={busy}>
            {takes.length ? "Retake" : "Generate"}
          </Button>
          {selected?.estCostUsd !== undefined && <span className="mono text-[11px] text-fg-3 ml-1">{fmtCost(selected.estCostUsd)}</span>}
          <span className="ml-auto flex opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="sm" variant="ghost" onClick={() => onMove(-1)} title="move earlier">
              ←
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onMove(1)} title="move later">
              →
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}

function SceneEditor({ scene, open, onClose }: { scene?: Scene; open: boolean; onClose: () => void }) {
  const { api, state } = useHarness();
  const [title, setTitle] = useState(scene?.title ?? "");
  const [desc, setDesc] = useState(scene?.description ?? "");
  const [loc, setLoc] = useState(scene?.locationId ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState<string | undefined>();
  if (open && key !== (scene?.id ?? "new")) {
    setKey(scene?.id ?? "new");
    setTitle(scene?.title ?? "");
    setDesc(scene?.description ?? "");
    setLoc(scene?.locationId ?? "");
    setErr(null);
  }
  if (!open && key !== undefined) setKey(undefined);
  const locations = (state?.assets ?? []).filter((a) => a.kind === "location");

  async function save() {
    try {
      const body = { title, description: desc || undefined, locationId: loc || undefined };
      if (scene) await api(`/api/scenes/${scene.id}`, { method: "PATCH", body });
      else await api("/api/scenes", { body });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function remove() {
    if (!scene || !confirm(`Delete scene "${scene.title}" and all its shots/takes?`)) return;
    await api(`/api/scenes/${scene.id}`, { method: "DELETE" });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={scene ? "Edit scene" : "New scene"}>
      <div className="grid gap-3">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Scene 1 — Morning" />
        </Field>
        <Field label="Description (context only, not sent to the model)">
          <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        <Field label="Default location asset" hint="Its reference images are attached to every shot in this scene.">
          <select value={loc} onChange={(e) => setLoc(e.target.value)}>
            <option value="">none</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <ErrorLine error={err} />
        <div className="flex gap-2 justify-end">
          {scene && (
            <Button variant="danger" onClick={remove} className="mr-auto">
              Delete scene
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!title.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
