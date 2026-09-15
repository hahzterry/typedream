import { body, handle, ok } from "@/lib/api";
import { importScript, type ScriptFile } from "@/lib/story";

export const dynamic = "force-dynamic";

/** Bulk import a script file (assets + scenes + shots). See DIRECTOR.md for the shape. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/projects/[pid]/import">) => {
  const { pid } = await ctx.params;
  return ok(await importScript(pid, await body<ScriptFile>(req)), { status: 201 });
});
