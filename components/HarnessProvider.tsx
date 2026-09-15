"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Db } from "@/lib/types";

export type State = Db & { env: { falKey: boolean; arkKey: boolean }; now: string };

interface Ctx {
  pid: string;
  state: State | null;
  error: string | null;
  refresh: () => Promise<void>;
  /** JSON/form fetch against a project-relative API path (e.g. "/shots"). Throws with the server's error message. */
  api: <T = unknown>(path: string, init?: { method?: string; body?: unknown; form?: FormData }) => Promise<T>;
  /** Project-relative page href, e.g. href("/assets") -> "/p/<pid>/assets". */
  href: (path?: string) => string;
  refUrl: (assetId: string, file: string) => string;
  outputUrl: (file: string) => string;
  assemblyUrl: (file: string) => string;
  busy: boolean;
}

const HarnessCtx = createContext<Ctx | null>(null);

export function HarnessProvider({ pid, children }: { pid: string; children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const base = `/api/projects/${pid}`;

  const fetchState = useCallback(async (): Promise<State | null> => {
    try {
      const res = await fetch(base, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 404 ? "project not found" : `HTTP ${res.status}`);
      const s = (await res.json()) as State;
      setState(s);
      setError(null);
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [base]);

  const refresh = useCallback(async () => {
    await fetchState();
  }, [fetchState]);

  useEffect(() => {
    let cancelled = false;
    const loop = async () => {
      const s = await fetchState();
      if (cancelled) return;
      const active = s?.takes.some((t) => t.status === "queued" || t.status === "running");
      timer.current = setTimeout(loop, active ? 3000 : 12000);
    };
    timer.current = setTimeout(loop, 0);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fetchState]);

  const api = useCallback(
    async <T,>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}) => {
      setBusy(true);
      try {
        const res = await fetch(base + path, {
          method: init.method ?? (init.body || init.form ? "POST" : "GET"),
          headers: init.form ? undefined : init.body ? { "Content-Type": "application/json" } : undefined,
          body: init.form ?? (init.body ? JSON.stringify(init.body) : undefined),
        });
        const text = await res.text();
        let data: unknown = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }
        if (!res.ok) {
          const msg = data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : `HTTP ${res.status}`;
          throw new Error(msg);
        }
        await fetchState();
        return data as T;
      } finally {
        setBusy(false);
      }
    },
    [base, fetchState],
  );

  const value: Ctx = {
    pid,
    state,
    error,
    refresh,
    api,
    busy,
    href: (path = "") => `/p/${pid}${path}`,
    refUrl: (assetId, file) => `${base}/files/refs/${encodeURIComponent(assetId)}/${encodeURIComponent(file)}`,
    outputUrl: (file) => `${base}/files/output/${encodeURIComponent(file)}`,
    assemblyUrl: (file) => `${base}/files/assembly/${encodeURIComponent(file)}`,
  };
  return <HarnessCtx.Provider value={value}>{children}</HarnessCtx.Provider>;
}

export function useHarness() {
  const ctx = useContext(HarnessCtx);
  if (!ctx) throw new Error("useHarness outside provider");
  return ctx;
}
