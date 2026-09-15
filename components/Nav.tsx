"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHarness } from "./HarnessProvider";

const links = [
  { href: "/", label: "Storyboard" },
  { href: "/assets", label: "Characters & Assets" },
  { href: "/assemble", label: "Assemble" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  const { state, error } = useHarness();
  const active = state?.takes.filter((t) => t.status === "queued" || t.status === "running").length ?? 0;
  const spent = state?.takes.filter((t) => t.status === "done").reduce((s, t) => s + (t.estCostUsd ?? 0), 0) ?? 0;
  const provider = state?.project.provider;
  const keyMissing = provider === "fal" && state && !state.env.falKey;

  return (
    <header className="border-b border-line bg-bg-2/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-[1500px] mx-auto px-4 md:px-6 h-12 flex items-center gap-6">
        <Link href="/" className="font-semibold tracking-tight flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-accent inline-block" />
          {state?.project.name ?? "Seedance Harness"}
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {links.map((l) => {
            const on = l.href === "/" ? path === "/" || path.startsWith("/shots") : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={`px-2.5 py-1 rounded-md ${on ? "bg-bg-3 text-fg" : "text-fg-2 hover:text-fg"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs text-fg-2">
          {error && <span className="text-err">server unreachable</span>}
          {keyMissing && <span className="text-warn">FAL_KEY missing</span>}
          {provider && (
            <span className="mono">
              {provider}
              {provider === "mock" && <span className="text-warn"> (free test mode)</span>}
              {" · "}
              {state?.project.model}
            </span>
          )}
          {active > 0 && (
            <span className="inline-flex items-center gap-1.5 text-warn">
              <span className="w-1.5 h-1.5 rounded-full bg-warn pulse" /> {active} generating
            </span>
          )}
          <span className="mono text-fg-3">spent ≈${spent.toFixed(2)}</span>
        </div>
      </div>
    </header>
  );
}
