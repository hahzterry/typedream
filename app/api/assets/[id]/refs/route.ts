import path from "node:path";
import { HttpError, handle, ok } from "@/lib/api";
import { addRefFromBuffer, addRefFromPath, addRefFromUrl } from "@/lib/assets";

export const dynamic = "force-dynamic";

/**
 * Add reference images.
 * - multipart/form-data: files[] (+ optional label)
 * - application/json: { path } | { url } (+ label, useInVideo)
 */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/assets/[id]/refs">) => {
  const { id } = await ctx.params;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const label = (form.get("label") as string | null) ?? undefined;
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!files.length) throw new HttpError(400, "no files");
    const refs = [];
    for (const f of files) {
      const buf = Buffer.from(await f.arrayBuffer());
      refs.push(await addRefFromBuffer(id, buf, path.extname(f.name) || ".png", { label: label ?? path.basename(f.name, path.extname(f.name)) }));
    }
    return ok(refs, { status: 201 });
  }
  const b = (await req.json()) as { path?: string; url?: string; label?: string; useInVideo?: boolean };
  if (b.path) return ok(await addRefFromPath(id, b.path, { label: b.label, useInVideo: b.useInVideo }), { status: 201 });
  if (b.url) return ok(await addRefFromUrl(id, b.url, { label: b.label, useInVideo: b.useInVideo }), { status: 201 });
  throw new HttpError(400, "provide files, path or url");
});
