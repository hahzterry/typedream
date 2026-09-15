"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ErrorLine, Field } from "./ui";
import type { ProjectSummary } from "@/lib/types";

export function ProjectsHome() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/projects", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && Array.isArray(d) && setProjects(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  async function create() {
    setErr(null);
    setCreating(true);
    try {
      const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.push(`/p/${data.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-line">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-4">
          <span className="wordmark text-base">typedream</span>
          <span className="text-fg-3 text-sm hidden sm:inline">anime production harness · Seedance 2.x</span>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto px-6 py-10 grid gap-10 lg:grid-cols-[380px_1fr]">
        <section className="card p-6 grid gap-4 content-start h-fit lg:sticky lg:top-8">
          <div>
            <h1 className="text-lg font-semibold">New project</h1>
            <p className="text-fg-2 text-sm mt-1">One project per anime. Characters, scenes, shots and takes live inside it.</p>
          </div>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Paper Sky" autoFocus onKeyDown={(e) => e.key === "Enter" && name.trim() && create()} />
          </Field>
          <Field label="Description" hint="Logline or synopsis. Kept for you; not sent to the model.">
            <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Two students on a school rooftop, a promise, and a city that keeps changing while they wait…" className="!font-sans !text-sm" />
          </Field>
          <ErrorLine error={err} />
          <Button variant="primary" onClick={create} disabled={!name.trim() || creating} className="justify-center py-2">
            {creating ? "Creating…" : "Create project"}
          </Button>
          <p className="text-fg-3 text-xs">Style, model, aspect ratio and resolution can be set afterwards in the project&apos;s settings.</p>
        </section>

        <section className="grid gap-4 content-start">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-semibold">Projects</h2>
            {projects && <span className="text-fg-3 text-sm">{projects.length}</span>}
          </div>
          {projects === null && <div className="text-fg-3 text-sm">Loading…</div>}
          {projects?.length === 0 && (
            <div className="border border-dashed border-line-2 rounded-xl p-10 text-center text-fg-3 text-sm">No projects yet. Create your first one on the left.</div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {projects?.map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className="card card-hover p-5 grid gap-3 content-start transition-colors group">
                <div className="flex items-start gap-2">
                  <h3 className="font-semibold text-base group-hover:text-accent-2 transition-colors">{p.name}</h3>
                  {p.takesActive > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-warn">
                      <span className="w-1.5 h-1.5 rounded-full bg-warn pulse" /> {p.takesActive} generating
                    </span>
                  )}
                </div>
                <p className="text-fg-2 text-sm line-clamp-3 min-h-[2.5rem]">{p.description || <span className="text-fg-3 italic">No description</span>}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3 mono pt-1 border-t border-line">
                  <span>{p.assets} assets</span>
                  <span>{p.scenes} scenes</span>
                  <span>{p.shots} shots</span>
                  <span>{p.takesDone} takes done</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-fg-3">
                  <span className="mono">
                    {p.provider} · {p.model}
                  </span>
                  <span className="ml-auto">updated {relTime(p.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function relTime(iso: string) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
