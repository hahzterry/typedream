import { handle, ok } from "@/lib/api";
import { getDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const db = getDb();
  return ok({
    ...db,
    env: {
      falKey: !!process.env.FAL_KEY,
      arkKey: !!process.env.ARK_API_KEY,
    },
    now: new Date().toISOString(),
  });
});
