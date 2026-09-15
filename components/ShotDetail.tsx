"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useHarness } from "./HarnessProvider";
import { ShotEditor } from "./ShotEditor";
import { VideoPlayer } from "./VideoPlayer";
import { Button, Chip, ErrorLine, StatusBadge, fmtCost, fmtDuration } from "./ui";
import type { Scene, Shot, Take } from "@/lib/types";

interface Detail {
  shot: Shot;
  scene?: Scene;
  takes: Take[];
  preview: { prompt: string; warnings: string[]; refs: { assetId: string; assetName: string; refId: string; file: string; label: string; imageIndex: number }[] };
}

export function ShotDetail({ id }: { id: string }) {
  const { pid, state, api, busy, href, refUrl, outputUrl } = useHarness();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState(1);
  const [showPrompt, setShowPrompt] = useState(false);
  const url = `/api/projects/${pid}/shots/${id}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setDetail(await res.json());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [url]);

  const tick = state?.now;
  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
        return res.json();
      })
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setErr(null);
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [url, tick]);

  if (err && !detail) return <ErrorLine error={err} />;
  if (!detail) return <div className="text-fg-3">Loading…</div>;
  const { shot, scene, takes, preview } = detail;
  const selected = takes.find((t) => t.id === shot.selectedTakeId);

  async function run(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="text-fg-3 text-xs">
            <Link href={href()} className="hover:text-fg">
              Storyboard
            </Link>
            <span className="mx-1.5">/</span>
            {scene?.title}
          </div>
          <h1 className="text-xl font-semibold truncate">{shot.title}</h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button onClick={() => setEditing(true)}>Edit shot</Button>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-auto">
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} take{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
          <Button variant="primary" disabled={busy} onClick={() => run(() => api(`/shots/${shot.id}/generate`, { body: { count } }))}>
            Generate
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm("Delete this shot and all takes?")) run(() => api(`/shots/${shot.id}`, { method: "DELETE" })).then(() => router.push(href()));
            }}
          >
            Delete
          </Button>
        </div>
      </div>
      <ErrorLine error={err} />

      <div className="grid lg:grid-cols-[1fr_380px] gap-5">
        <div className="grid gap-4">
          <div className="card p-3">
            {selected?.videoFile ? <VideoPlayer take={selected} className="max-h-[60vh]" /> : <div className="aspect-video flex items-center justify-center text-fg-3 text-sm">No selected take yet.</div>}
            {selected && (
              <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-fg-2 mono">
                <span>selected: take {selected.n}</span>
                <span>{selected.model}</span>
                <span>
                  {selected.params.resolution} · {selected.params.aspectRatio} · {selected.params.duration === "auto" ? "auto" : `${selected.params.duration}s`}
                </span>
                {selected.seedUsed !== undefined && <span>seed {selected.seedUsed}</span>}
                {selected.videoFile && (
                  <a className="text-info hover:underline ml-auto" href={outputUrl(selected.videoFile)} download>
                    download mp4
                  </a>
                )}
              </div>
            )}
          </div>

          <section className="grid gap-2">
            <h2 className="text-xs font-semibold text-fg-3 uppercase tracking-wide">Takes ({takes.length})</h2>
            {!takes.length && <div className="text-fg-3 text-sm">No takes yet — hit Generate.</div>}
            <div className="grid sm:grid-cols-2 gap-3">
              {takes
                .slice()
                .reverse()
                .map((t) => (
                  <TakeCard key={t.id} take={t} selected={t.id === shot.selectedTakeId} onChange={load} />
                ))}
            </div>
          </section>
        </div>

        <aside className="grid gap-4 content-start">
          <div className="card p-4 grid gap-3">
            <div className="text-[11px] uppercase tracking-wide text-fg-3">Shot prompt</div>
            <p className="text-sm whitespace-pre-wrap">{shot.prompt}</p>
            <div className="flex flex-wrap gap-1.5 mono text-[11px] text-fg-2">
              <Chip>{shot.duration === "auto" ? "auto" : `${shot.duration}s`}</Chip>
              <Chip>{shot.aspectRatio ?? `${state?.project.aspectRatio} (project)`}</Chip>
              <Chip>{shot.resolution ?? `${state?.project.resolution} (project)`}</Chip>
              <Chip>{shot.model ?? `${state?.project.model} (project)`}</Chip>
              {shot.seed !== undefined && <Chip>seed {shot.seed}</Chip>}
            </div>
            {shot.notes && <p className="text-xs text-fg-3 italic">{shot.notes}</p>}
          </div>

          <div className="card p-4 grid gap-3">
            <div className="text-[11px] uppercase tracking-wide text-fg-3">References that will be sent ({preview.refs.length}/9)</div>
            {!preview.refs.length && <div className="text-fg-3 text-xs">None. Add @tags to the prompt or attach refs to assets.</div>}
            <div className="grid grid-cols-3 gap-2">
              {preview.refs.map((r) => (
                <div key={r.refId} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={refUrl(r.assetId, r.file)} alt={r.assetName} className="w-full aspect-square object-cover rounded-lg border border-line" />
                  <span className="absolute top-1 left-1 mono text-[10px] bg-black/70 px-1 rounded">@Image{r.imageIndex}</span>
                  <div className="text-[11px] text-fg-2 truncate mt-0.5">
                    {r.assetName}
                    {r.label ? ` · ${r.label}` : ""}
                  </div>
                </div>
              ))}
            </div>
            {preview.warnings.map((w, i) => (
              <div key={i} className="text-warn text-xs">
                ⚠ {w}
              </div>
            ))}
            <button className="text-xs text-info hover:underline text-left" onClick={() => setShowPrompt((s) => !s)}>
              {showPrompt ? "hide" : "show"} full prompt as sent
            </button>
            {showPrompt && <pre className="text-[11px] mono whitespace-pre-wrap bg-bg border border-line rounded-lg p-2 max-h-80 overflow-auto">{preview.prompt}</pre>}
          </div>
        </aside>
      </div>

      <ShotEditor
        open={editing}
        onClose={() => {
          setEditing(false);
          load();
        }}
        shot={shot}
      />
    </div>
  );
}

function TakeCard({ take, selected, onChange }: { take: Take; selected: boolean; onChange: () => void }) {
  const { api, busy } = useHarness();
  const [showLog, setShowLog] = useState(false);
  const live = take.status === "queued" || take.status === "running";
  return (
    <div className={`card p-3 grid gap-2 ${selected ? "!border-accent/60" : ""}`}>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold">Take {take.n}</span>
        <StatusBadge status={take.status} />
        {selected && <Chip tone="accent">selected</Chip>}
        <span className="ml-auto mono text-fg-3">
          {live ? fmtDuration(take.createdAt) : fmtDuration(take.createdAt, take.finishedAt)} {fmtCost(take.estCostUsd)}
        </span>
      </div>
      {take.videoFile ? (
        <VideoPlayer take={take} />
      ) : (
        <div className="aspect-video bg-black/40 rounded-lg flex items-center justify-center text-xs text-fg-3 px-3 text-center">
          {take.error ? <span className="text-err">{take.error}</span> : live ? `${take.status}…` : take.status}
        </div>
      )}
      <div className="flex items-center gap-1 flex-wrap">
        {take.status === "done" && !selected && (
          <Button size="sm" variant="primary" onClick={() => api(`/takes/${take.id}`, { method: "PATCH", body: { select: true } }).then(onChange)}>
            Use this take
          </Button>
        )}
        {take.status === "done" && (
          <span className="flex items-center gap-0.5 ml-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={`text-sm ${(take.rating ?? 0) >= n ? "text-warn" : "text-fg-3 hover:text-fg-2"}`} onClick={() => api(`/takes/${take.id}`, { method: "PATCH", body: { rating: n } }).then(onChange)}>
                ★
              </button>
            ))}
          </span>
        )}
        <span className="ml-auto flex gap-1">
          {(take.log?.length ?? 0) > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowLog((s) => !s)}>
              log
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => (live || confirm("Delete this take?")) && api(`/takes/${take.id}`, { method: "DELETE" }).then(onChange)}>
            {live ? "cancel" : "delete"}
          </Button>
        </span>
      </div>
      {showLog && <pre className="text-[10px] mono text-fg-2 whitespace-pre-wrap bg-bg border border-line rounded-lg p-2 max-h-48 overflow-auto">{take.log?.join("\n")}</pre>}
      <div className="mono text-[10px] text-fg-3 truncate" title={take.resolvedPrompt}>
        {take.model} · {take.params.resolution} · {take.params.aspectRatio} · {take.refs.length} refs{take.seedUsed !== undefined ? ` · seed ${take.seedUsed}` : ""}
        {take.requestId ? ` · ${take.requestId.slice(0, 12)}` : ""}
      </div>
    </div>
  );
}
