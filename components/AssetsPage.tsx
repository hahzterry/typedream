"use client";

import { useRef, useState } from "react";
import { refUrl, useHarness } from "./HarnessProvider";
import { Button, Chip, Empty, ErrorLine, Field, Modal } from "./ui";
import type { Asset, AssetKind } from "@/lib/types";

const KINDS: { kind: AssetKind; label: string }[] = [
  { kind: "character", label: "Characters" },
  { kind: "location", label: "Locations" },
  { kind: "prop", label: "Props" },
  { kind: "style", label: "Style refs" },
];

export function AssetsPage() {
  const { state } = useHarness();
  const [editing, setEditing] = useState<Asset | AssetKind | null>(null);
  if (!state) return <div className="text-fg-3">Loading…</div>;

  return (
    <div className="grid gap-8">
      {KINDS.map(({ kind, label }) => {
        const items = state.assets.filter((a) => a.kind === kind);
        return (
          <section key={kind} className="grid gap-3">
            <div className="flex items-center gap-3 border-b border-line pb-2">
              <h2 className="font-semibold">{label}</h2>
              <span className="text-fg-3 text-sm">{items.length}</span>
              <Button size="sm" className="ml-auto" onClick={() => setEditing(kind)}>
                + {kind}
              </Button>
            </div>
            {!items.length && <Empty>No {label.toLowerCase()} yet.</Empty>}
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {items.map((a) => (
                <AssetCard key={a.id} asset={a} onEdit={() => setEditing(a)} />
              ))}
            </div>
          </section>
        );
      })}
      <AssetEditor
        open={!!editing}
        onClose={() => setEditing(null)}
        asset={editing && typeof editing === "object" ? editing : undefined}
        kind={typeof editing === "string" ? editing : undefined}
      />
    </div>
  );
}

function AssetCard({ asset, onEdit }: { asset: Asset; onEdit: () => void }) {
  const { api, busy, state } = useHarness();
  const fileInput = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const isStyle = state?.project.styleAssetId === asset.id;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData();
    for (const f of Array.from(files)) form.append("files", f);
    try {
      await api(`/api/assets/${asset.id}/refs`, { form });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="bg-bg-2 border border-line rounded-lg p-3 grid gap-3 content-start">
      <div className="flex items-start gap-2">
        <div>
          <div className="font-medium">{asset.name}</div>
          <div className="mono text-xs text-accent-2">@{asset.tag}</div>
        </div>
        {isStyle && <Chip tone="accent">global style</Chip>}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            edit
          </Button>
        </div>
      </div>
      {asset.description && <p className="text-xs text-fg-2 line-clamp-4">{asset.description}</p>}

      <div className="grid grid-cols-3 gap-2">
        {asset.refs.map((r) => (
          <div key={r.id} className={`relative group rounded overflow-hidden border ${r.useInVideo ? "border-line" : "border-line opacity-40"}`}>
            <a href={refUrl(asset.id, r.file)} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={refUrl(asset.id, r.file)} alt={r.label} className="w-full aspect-square object-cover" />
            </a>
            <div className="absolute inset-x-0 bottom-0 bg-black/70 text-[10px] px-1 py-0.5 truncate">{r.label || "ref"}</div>
            <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
              <button
                className="bg-black/70 rounded px-1 text-[10px]"
                title={r.useInVideo ? "exclude from video refs" : "include in video refs"}
                onClick={() => api(`/api/assets/${asset.id}/refs/${r.id}`, { method: "PATCH", body: { useInVideo: !r.useInVideo } })}
              >
                {r.useInVideo ? "on" : "off"}
              </button>
              <button className="bg-black/70 rounded px-1 text-[10px] text-err" onClick={() => confirm("Delete this reference?") && api(`/api/assets/${asset.id}/refs/${r.id}`, { method: "DELETE" })}>
                ×
              </button>
            </div>
          </div>
        ))}
        <button
          className="aspect-square rounded border border-dashed border-line-2 text-fg-3 hover:text-fg hover:border-fg-3 text-xs flex flex-col items-center justify-center gap-1"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          <span className="text-lg leading-none">+</span>upload
        </button>
      </div>
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      <div className="flex gap-1.5 flex-wrap">
        <Button size="sm" onClick={() => setGenOpen(true)} disabled={busy}>
          ✦ Generate ref image
        </Button>
        <span className="mono text-[11px] text-fg-3 self-center ml-auto">
          {asset.refs.filter((r) => r.useInVideo).length} of {asset.refs.length} used
        </span>
      </div>
      <ErrorLine error={err} />
      <GenerateRefModal asset={asset} open={genOpen} onClose={() => setGenOpen(false)} />
    </div>
  );
}

function GenerateRefModal({ asset, open, onClose }: { asset: Asset; open: boolean; onClose: () => void }) {
  const { api, state } = useHarness();
  const [prompt, setPrompt] = useState("");
  const [n, setN] = useState(2);
  const [size, setSize] = useState("1024x1024");
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [w, h] = size.split("x").map(Number);

  async function go() {
    setErr(null);
    setRunning(true);
    try {
      await api(`/api/assets/${asset.id}/refs/generate`, { body: { prompt: prompt || undefined, n, width: w, height: h, label: label || undefined } });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Generate reference images for ${asset.name}`}>
      <div className="grid gap-3">
        <div className="text-xs text-fg-2">
          Uses <span className="mono">{state?.project.imageModel}</span>. The project style prompt and the asset description are included automatically; add pose / angle / expression guidance below.
        </div>
        <Field label="Extra guidance">
          <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={asset.kind === "character" ? "e.g. three-quarter view, slight smile, school uniform, white background" : "e.g. wide establishing view at sunset"} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Count">
            <select value={n} onChange={(e) => setN(Number(e.target.value))}>
              {[1, 2, 3, 4].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Size">
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="1024x1024">1024 × 1024</option>
              <option value="1024x1536">1024 × 1536 (portrait)</option>
              <option value="1536x1024">1536 × 1024 (landscape)</option>
              <option value="1920x1080">1920 × 1080</option>
            </select>
          </Field>
          <Field label="Label">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="front view" />
          </Field>
        </div>
        <ErrorLine error={err} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={go} disabled={running}>
            {running ? "Generating…" : "Generate"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AssetEditor({ open, onClose, asset, kind }: { open: boolean; onClose: () => void; asset?: Asset; kind?: AssetKind }) {
  const { api, state } = useHarness();
  const [key, setKey] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [desc, setDesc] = useState("");
  const [notes, setNotes] = useState("");
  const [k, setK] = useState<AssetKind>("character");
  const [err, setErr] = useState<string | null>(null);
  const [isStyle, setIsStyle] = useState(false);
  const id = asset?.id ?? `new-${kind}`;
  if (open && key !== id) {
    setKey(id);
    setName(asset?.name ?? "");
    setTag(asset?.tag ?? "");
    setDesc(asset?.description ?? "");
    setNotes(asset?.notes ?? "");
    setK(asset?.kind ?? kind ?? "character");
    setIsStyle(!!asset && state?.project.styleAssetId === asset.id);
    setErr(null);
  }
  if (!open && key !== undefined) setKey(undefined);

  async function save() {
    setErr(null);
    try {
      const body = { name, tag: tag || undefined, description: desc, notes: notes || undefined, kind: k };
      const saved = asset ? await api<Asset>(`/api/assets/${asset.id}`, { method: "PATCH", body }) : await api<Asset>("/api/assets", { body });
      if (k === "style" || asset) {
        const cur = state?.project.styleAssetId;
        if (isStyle && cur !== saved.id) await api("/api/project", { method: "PATCH", body: { styleAssetId: saved.id } });
        if (!isStyle && cur === saved.id) await api("/api/project", { method: "PATCH", body: { styleAssetId: null } });
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  async function remove() {
    if (!asset || !confirm(`Delete ${asset.name} and its reference images?`)) return;
    await api(`/api/assets/${asset.id}`, { method: "DELETE" });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={asset ? `Edit ${asset.name}` : `New ${k}`}>
      <div className="grid gap-3">
        <div className="grid grid-cols-[1fr_160px_140px] gap-3">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aki Tanaka" />
          </Field>
          <Field label="Tag (used as @tag)">
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="auto from name" className="mono" />
          </Field>
          <Field label="Kind">
            <select value={k} onChange={(e) => setK(e.target.value as AssetKind)}>
              {KINDS.map((x) => (
                <option key={x.kind} value={x.kind}>
                  {x.kind}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          label={k === "character" ? "Appearance lock (sent with every shot using this character)" : "Description (sent with every shot using this asset)"}
          hint={k === "character" ? "Age, build, hair (color/length/style), eyes, skin, outfit with colors, accessories, distinguishing marks. Be concrete." : undefined}
        >
          <textarea rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        <Field label="Director notes (voice, personality, arcs — not sent to model)">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {k === "style" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="w-auto" checked={isStyle} onChange={(e) => setIsStyle(e.target.checked)} />
            Attach to every shot as the global style reference
          </label>
        )}
        <ErrorLine error={err} />
        <div className="flex gap-2 justify-end">
          {asset && (
            <Button variant="danger" className="mr-auto" onClick={remove}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
