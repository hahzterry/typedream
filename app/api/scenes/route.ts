import { body, handle, ok, required } from "@/lib/api";
import { getDb } from "@/lib/store";
import { createScene } from "@/lib/story";

export const dynamic = "force-dynamic";

export const GET = handle(async () => ok(getDb().scenes));

export const POST = handle(async (req: Request) => {
  const b = await body<{ title: string; description?: string; locationId?: string }>(req);
  return ok(await createScene({ ...b, title: required(b.title, "title") }), { status: 201 });
});
