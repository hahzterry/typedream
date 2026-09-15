import { body, handle, ok, required } from "@/lib/api";
import { getDb } from "@/lib/store";
import { createShot, type ShotInput } from "@/lib/story";

export const dynamic = "force-dynamic";

export const GET = handle(async () => ok(getDb().shots));

export const POST = handle(async (req: Request) => {
  const b = await body<ShotInput>(req);
  required(b.sceneId, "sceneId");
  required(b.title, "title");
  required(b.prompt, "prompt");
  return ok(await createShot(b), { status: 201 });
});
