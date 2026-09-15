"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useHarness } from "./HarnessProvider";
import { Button, Empty, ErrorLine } from "./ui";

interface Info {
  plan: { shotId: string; title: string; file?: string; missing: boolean }[];
  assemblies: { file: string; size: number; createdAt: string }[];
}

export function AssemblePage() {
  const { pid, state, api, href, assemblyUrl } = useHarness();
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const url = `/api/projects/${pid}/assemble`;

  const tick = state?.now;
  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => alive && d && setInfo(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url, tick]);

  async function go(skipMissing: boolean) {
    setErr(null);
    setRunning(true);
    try {
      await api("/assemble", { body: { skipMissing } });
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) setInfo(await res.json());
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
        <div>
          <h1 className="text-xl font-semibold">Assemble</h1>
          <div className="text-fg-3 text-sm mt-0.5">
            {info.plan.length - missing.length} of {info.plan.length} shots have a picked take. Cuts are re-encoded to the project aspect ratio at 1080p.
          </div>
        </div>
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
          <h2 className="text-xs font-semibold text-fg-3 uppercase tracking-wide">Cut order</h2>
          {!info.plan.length && <Empty>No shots.</Empty>}
          <ol className="grid gap-1">
            {info.plan.map((p, i) => (
              <li key={p.shotId} className={`flex items-center gap-2 text-sm px-2 py-1 rounded-lg ${p.missing ? "text-fg-3" : "text-fg"}`}>
                <span className="mono text-xs text-fg-3 w-6">{i + 1}.</span>
                <Link href={href(`/shots/${p.shotId}`)} className="hover:text-accent-2 truncate">
                  {p.title}
                </Link>
                <span className={`ml-auto text-[10px] uppercase ${p.missing ? "text-warn" : "text-ok"}`}>{p.missing ? "no take" : "ready"}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="grid gap-3 content-start">
          <h2 className="text-xs font-semibold text-fg-3 uppercase tracking-wide">Renders</h2>
          {!info.assemblies.length && <Empty>Nothing rendered yet.</Empty>}
          {info.assemblies.map((a) => (
            <div key={a.file} className="card p-3 grid gap-2">
              <video src={assemblyUrl(a.file)} controls preload="metadata" className="w-full bg-black rounded-lg" />
              <div className="flex items-center gap-3 text-xs text-fg-2 mono flex-wrap">
                <span className="truncate">{a.file}</span>
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
