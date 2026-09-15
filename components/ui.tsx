"use client";

import { useEffect, type ReactNode } from "react";
import type { TakeStatus } from "@/lib/types";

export function Button({
  children,
  onClick,
  variant = "default",
  size = "md",
  disabled,
  title,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  className?: string;
}) {
  const base = "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
  const sizes = size === "sm" ? "text-xs px-2 py-1" : "text-sm px-3 py-1.5";
  const variants = {
    default: "bg-bg-3 border border-line-2 hover:border-fg-3 text-fg",
    primary: "bg-accent text-black hover:bg-accent-2",
    danger: "bg-transparent border border-err/50 text-err hover:bg-err/10",
    ghost: "bg-transparent text-fg-2 hover:text-fg hover:bg-bg-3",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${sizes} ${variants} ${className}`}>
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: TakeStatus | "draft" }) {
  const map: Record<string, string> = {
    draft: "bg-bg-3 text-fg-3 border-line-2",
    queued: "bg-info/10 text-info border-info/40",
    running: "bg-warn/10 text-warn border-warn/40",
    done: "bg-ok/10 text-ok border-ok/40",
    failed: "bg-err/10 text-err border-err/40",
    cancelled: "bg-bg-3 text-fg-3 border-line-2",
  };
  const live = status === "queued" || status === "running";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide px-2 py-0.5 rounded border ${map[status]}`}>
      {live && <span className="w-1.5 h-1.5 rounded-full bg-current pulse" />}
      {status}
    </span>
  );
}

export function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" }) {
  return (
    <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded border ${tone === "accent" ? "border-accent/40 text-accent-2 bg-accent/10" : "border-line-2 text-fg-2 bg-bg-3"}`}>
      {children}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wide text-fg-3 mb-1">{label}</div>
      {children}
      {hint && <div className="text-xs text-fg-3 mt-1">{hint}</div>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className={`bg-bg-2 border border-line-2 rounded-lg shadow-2xl w-full ${wide ? "max-w-4xl" : "max-w-2xl"} mt-8`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-fg-3 hover:text-fg text-lg leading-none px-1">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="text-err text-sm bg-err/10 border border-err/30 rounded px-3 py-2">{error}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-fg-3 text-sm border border-dashed border-line-2 rounded-lg p-8 text-center">{children}</div>;
}

export function fmtDuration(iso1?: string, iso2?: string) {
  if (!iso1) return "";
  const ms = (iso2 ? Date.parse(iso2) : Date.now()) - Date.parse(iso1);
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

export function fmtCost(n?: number) {
  return n === undefined ? "" : `≈$${n.toFixed(2)}`;
}
