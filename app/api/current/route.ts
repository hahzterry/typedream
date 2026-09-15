import { body, handle, ok } from "@/lib/api";
import { getCurrentProject, setCurrentProject } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The CLI's "current project" pointer (data/current.json). */
export const GET = handle(async () => ok({ id: getCurrentProject() ?? null }));

export const PUT = handle(async (req: Request) => {
  const { id } = await body<{ id: string | null }>(req);
  await setCurrentProject(id ?? undefined);
  return ok({ id: id ?? null });
});
