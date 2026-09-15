import { body, handle, ok } from "@/lib/api";
import { assemble, assemblyPlan, listAssemblies } from "@/lib/assemble";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export const GET = handle(async () => ok({ plan: assemblyPlan(), assemblies: await listAssemblies() }));

export const POST = handle(async (req: Request) => {
  let b: { sceneIds?: string[]; name?: string; skipMissing?: boolean } = {};
  try {
    b = await body(req);
  } catch {
    /* empty ok */
  }
  return ok(await assemble(b), { status: 201 });
});
