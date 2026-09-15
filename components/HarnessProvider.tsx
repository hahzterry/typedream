"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Db } from "@/lib/types";

export type State = Db & { env: { falKey: boolean; arkKey: boolean }; now: string };

interface Ctx {
  state: State | null;
  error: string | null;
  refresh: () => Promise<void>;
  /** JSON fetch helper; throws on non-2xx with the server's error message. */
  api: <T = unknown>(path: string, init?: { method?: string; body?: unknown; form?: FormData }) => Promise<T>;
  busy: boolean;
}

const HarnessCtx = createContext<Ctx | null>(null);

export function HarnessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchState = useCallback(async (): Promise<State | null> => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = (await res.json()) as State;
      setState(s);
      setError(null);
      return s;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetchState();
  }, [fetchState]);

  // Poll: fast while takes are active, slow otherwise.
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
        const res = await fetch(path, {
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
        await refresh();
        return data as T;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return <HarnessCtx.Provider value={{ state, error, refresh, api, busy }}>{children}</HarnessCtx.Provider>;
}

export function useHarness() {
  const ctx = useContext(HarnessCtx);
  if (!ctx) throw new Error("useHarness outside provider");
  return ctx;
}

export const refUrl = (assetId: string, file: string) => `/api/files/refs/${encodeURIComponent(assetId)}/${encodeURIComponent(file)}`;
export const outputUrl = (file: string) => `/api/files/output/${encodeURIComponent(file)}`;
export const assemblyUrl = (file: string) => `/api/files/assembly/${encodeURIComponent(file)}`;
