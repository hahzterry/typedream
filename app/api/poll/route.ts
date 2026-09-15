import { handle, ok } from "@/lib/api";
import { activeTakes, pollAll } from "@/lib/jobs";

export const dynamic = "force-dynamic";

/** Force one poll pass now (the server also polls on its own). */
export const POST = handle(async () => {
  const changed = await pollAll();
  return ok({ changed, active: activeTakes().length });
});
