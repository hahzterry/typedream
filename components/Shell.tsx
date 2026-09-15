"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useHarness } from "./HarnessProvider";

const NAV = [
  { path: "", label: "Storyboard", icon: "▦" },
  { path: "/assets", label: "Characters & Assets", icon: "☺" },
  { path: "/assemble", label: "Assemble", icon: "⧉" },
  { path: "/settings", label: "Settings", icon: "⚙" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { state, error, href } = useHarness();
  const pathname = usePathname();
  const active = state?.takes.filter((t) => t.status === "queued" || t.status === "running").length ?? 0;
  const spent = state?.takes.filter((t) => t.status === "done").reduce((s, t) => s + (t.estCostUsd ?? 0), 0) ?? 0;
  const provider = state?.project.provider;
  const keyMissing = provider === "fal" && state && !state.env.falKey;

  if (error === "project not found") {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="card p-8 text-center grid gap-3">
          <div className="text-lg font-semibold">Project not found</div>
          <Link href="/" className="text-accent-2 hover:underline text-sm">
            ← All projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-screen">
      <aside className="md:w-60 md:shrink-0 bg-bg-2 border-b md:border-b-0 md:border-r border-line flex flex-col md:sticky md:top-0 md:h-screen">
        <div className="px-4 pt-4 pb-3 border-b border-line">
          <Link href="/" className="wordmark text-xs text-fg-2 hover:text-fg">
            typedream
          </Link>
          <div className="mt-2 font-semibold text-base leading-tight truncate" title={state?.project.name}>
            {state?.project.name ?? "…"}
          </div>
          {state?.project.description && <p className="text-fg-3 text-xs mt-1 line-clamp-2">{state.project.description}</p>}
          <Link href="/" className="text-[11px] text-fg-3 hover:text-fg-2 mt-2 inline-block">
            ← switch project
          </Link>
        </div>

        <nav className="flex md:flex-col gap-0.5 p-2 overflow-x-auto">
          {NAV.map((n) => {
            const full = href(n.path);
            const on = n.path === "" ? pathname === full || pathname.startsWith(href("/shots")) : pathname.startsWith(full);
            return (
              <Link
                key={n.path}
                href={full}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${on ? "bg-bg-4 text-fg" : "text-fg-2 hover:text-fg hover:bg-bg-3"}`}
              >
                <span className={`w-4 text-center ${on ? "text-accent" : "text-fg-3"}`}>{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block mt-auto p-4 border-t border-line text-xs text-fg-3 grid gap-1.5">
          {error && error !== "project not found" && <div className="text-err">server unreachable</div>}
          {keyMissing && <div className="text-warn">FAL_KEY missing in .env.local</div>}
          {provider && (
            <div className="mono">
              {provider}
              {provider === "mock" && <span className="text-warn"> · free test mode</span>}
            </div>
          )}
          {state && <div className="mono">{state.project.model} · {state.project.resolution} · {state.project.aspectRatio}</div>}
          {active > 0 ? (
            <div className="inline-flex items-center gap-1.5 text-warn">
              <span className="w-1.5 h-1.5 rounded-full bg-warn pulse" /> {active} generating
            </div>
          ) : (
            <div>idle</div>
          )}
          <div className="mono">spent ≈${spent.toFixed(2)}</div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-4 md:px-8 py-6 max-w-[1400px]">{children}</main>
    </div>
  );
}
