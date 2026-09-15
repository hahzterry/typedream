import { body, handle, ok, required } from "@/lib/api";
import { createProject, listProjects } from "@/lib/store";
import type { Project } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = handle(async () => ok(listProjects()));

/** Create a project. Body: { name, description?, ...any Project setting } */
export const POST = handle(async (req: Request) => {
  const b = await body<{ name: string; description?: string } & Partial<Project>>(req);
  required(b.name, "name");
  const project = await createProject(b);
  return ok(project, { status: 201 });
});
