import { body, handle, ok } from "@/lib/api";
import { addRefFromPath, createAsset } from "@/lib/assets";
import { importScript, type ScriptFile } from "@/lib/story";

export const dynamic = "force-dynamic";

/** Bulk import a script file (assets + scenes + shots). See HARNESS.md for the shape. */
export const POST = handle(async (req: Request) => {
  const script = await body<ScriptFile>(req);
  return ok(await importScript(script, { createAsset, addRefFromPath }), { status: 201 });
});
