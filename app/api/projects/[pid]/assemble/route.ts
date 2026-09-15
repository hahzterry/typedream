import { body, handle, ok } from "@/lib/api";
import { assemble, assemblyPlan, listAssemblies } from "@/lib/assemble";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/projects/[pid]/assemble">) => {
  const { pid } = await ctx.params;
  return ok({ plan: assemblyPlan(pid), assemblies: await listAssemblies(pid) });
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/projects/[pid]/assemble">) => {
  const { pid } = await ctx.params;
  let b: { sceneIds?: string[]; name?: string; skipMissing?: boolean } = {};
  try {
    b = await body(req);
  } catch {
    /* empty ok */
  }
  return ok(await assemble(pid, b), { status: 201 });
});
