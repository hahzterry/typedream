"use client";

import { useCallback, useEffect, useState } from "react";
import { assemblyUrl, useHarness } from "./HarnessProvider";
import { Button, Empty, ErrorLine } from "./ui";

interface Info {
  plan: { shotId: string; title: string; file?: string; missing: boolean }[];
  assemblies: { file: string; size: number; createdAt: string }[];
}

export function AssemblePage() {
  const { state, api } = useHarness();
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/assemble", { cache: "no-store" });
    if (res.ok) setInfo(await res.json());
  }, []);
  const tick = state?.now;
  useEffect(() => {
    let alive = true;
    fetch("/api/assemble", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => alive && d && setInfo(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tick]);

  async function go(skipMissing: boolean) {
    setErr(null);
    setRunning(true);
    try {
      await api("/api/assemble", { body: { skipMissing } });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  if (!info) return <div className="text-fg-3">Loading…</div>;
  const missing = info.plan.filter((p) => p.missing);

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-lg font-semibold">Assemble</h1>
        <span className="text-fg-3 text-sm">
          {info.plan.length - missing.length} of {info.plan.length} shots have a selected take
        </span>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => go(true)} disabled={running || info.plan.length === missing.length}>
            Assemble available
          </Button>
          <Button variant="primary" onClick={() => go(false)} disabled={running || !!missing.length || !info.plan.length}>
            {running ? "Rendering…" : "Assemble all"}
          </Button>
        </div>
      </div>
      <ErrorLine error={err} />

      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <section className="grid gap-2 content-start">
          <h2 className="text-sm font-semibold text-fg-2 uppercase tracking-wide">Cut order</h2>
          {!info.plan.length && <Empty>No shots.</Empty>}
          <ol className="grid gap-1">
            {info.plan.map((p, i) => (
              <li key={p.shotId} className={`flex items-center gap-2 text-sm px-2 py-1 rounded ${p.missing ? "text-fg-3" : "text-fg"}`}>
                <span className="mono text-xs text-fg-3 w-6">{i + 1}.</span>
                <a href={`/shots/${p.shotId}`} className="hover:text-accent-2 truncate">
                  {p.title}
                </a>
                <span className={`ml-auto text-[10px] uppercase ${p.missing ? "text-warn" : "text-ok"}`}>{p.missing ? "no take" : "ready"}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="grid gap-3 content-start">
          <h2 className="text-sm font-semibold text-fg-2 uppercase tracking-wide">Renders</h2>
          {!info.assemblies.length && <Empty>Nothing rendered yet.</Empty>}
          {info.assemblies.map((a) => (
            <div key={a.file} className="bg-bg-2 border border-line rounded-lg p-3 grid gap-2">
              <video src={assemblyUrl(a.file)} controls preload="metadata" className="w-full bg-black rounded" />
              <div className="flex items-center gap-3 text-xs text-fg-2 mono">
                <span>{a.file}</span>
                <span>{(a.size / 1e6).toFixed(1)} MB</span>
                <span>{new Date(a.createdAt).toLocaleString()}</span>
                <a className="ml-auto text-info hover:underline" href={assemblyUrl(a.file)} download>
                  download
                </a>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
