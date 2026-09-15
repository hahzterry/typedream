import { activeTakes, pollAll } from "./jobs";

// Background poller: runs inside the Next.js server process (see instrumentation.ts).
// Polls fast while something is active, idles otherwise.

type G = typeof globalThis & { __harnessPoller?: { timer?: NodeJS.Timeout; running: boolean } };
const g = globalThis as G;

const ACTIVE_MS = 5000;
const IDLE_MS = 15000;

export function startPoller() {
  if (g.__harnessPoller) return;
  const state = { running: false } as NonNullable<G["__harnessPoller"]>;
  g.__harnessPoller = state;
  const tick = async () => {
    if (!state.running) {
      state.running = true;
      try {
        if (activeTakes().length) await pollAll();
      } catch (e) {
        console.error("[poller]", e);
      } finally {
        state.running = false;
      }
    }
    state.timer = setTimeout(tick, activeTakes().length ? ACTIVE_MS : IDLE_MS);
    state.timer.unref?.();
  };
  state.timer = setTimeout(tick, 1000);
  state.timer.unref?.();
  console.log("[poller] started");
}
