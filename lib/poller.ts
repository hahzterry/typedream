import { anyActive, pollAll } from "./jobs";

// Background poller: runs inside the Next.js server process (see instrumentation.ts).
// Polls fast while something is active in any project, idles otherwise.

type G = typeof globalThis & { __tdPoller?: { timer?: NodeJS.Timeout; running: boolean } };
const g = globalThis as G;

const ACTIVE_MS = 5000;
const IDLE_MS = 15000;

export function startPoller() {
  if (g.__tdPoller) return;
  const state = { running: false } as NonNullable<G["__tdPoller"]>;
  g.__tdPoller = state;
  const tick = async () => {
    if (!state.running) {
      state.running = true;
      try {
        if (anyActive()) await pollAll();
      } catch (e) {
        console.error("[poller]", e);
      } finally {
        state.running = false;
      }
    }
    let active = false;
    try {
      active = anyActive();
    } catch {
      /* data dir may not exist yet */
    }
    state.timer = setTimeout(tick, active ? ACTIVE_MS : IDLE_MS);
    state.timer.unref?.();
  };
  state.timer = setTimeout(tick, 1000);
  state.timer.unref?.();
  console.log("[typedream] poller started");
}
