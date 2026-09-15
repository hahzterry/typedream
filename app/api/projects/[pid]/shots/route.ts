import { body, handle, ok, required } from "@/lib/api";
import { getDb } from "@/lib/store";
import { createShot, type ShotInput } from "@/lib/story";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/projects/[pid]/shots">) => {
  const { pid } = await ctx.params;
  return ok(getDb(pid).shots);
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/projects/[pid]/shots">) => {
  const { pid } = await ctx.params;
  const b = await body<ShotInput>(req);
  required(b.sceneId, "sceneId");
  required(b.title, "title");
  required(b.prompt, "prompt");
  return ok(await createShot(pid, b), { status: 201 });
});
