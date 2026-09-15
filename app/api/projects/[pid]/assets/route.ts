import { body, handle, ok, required } from "@/lib/api";
import { createAsset } from "@/lib/assets";
import { getDb } from "@/lib/store";
import type { AssetKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/projects/[pid]/assets">) => {
  const { pid } = await ctx.params;
  return ok(getDb(pid).assets);
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/projects/[pid]/assets">) => {
  const { pid } = await ctx.params;
  const b = await body<{ kind?: AssetKind; name: string; tag?: string; description?: string; notes?: string }>(req);
  const asset = await createAsset(pid, { kind: b.kind ?? "character", name: required(b.name, "name"), tag: b.tag, description: b.description, notes: b.notes });
  return ok(asset, { status: 201 });
});
