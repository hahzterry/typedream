import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { DATA_DIR } from "@/lib/paths";
import { mimeFor } from "@/lib/providers/fal";

export const dynamic = "force-dynamic";

const ALLOWED_ROOTS = new Set(["refs", "output", "assembly"]);

/** Serve files from the data dir with HTTP Range support (video seeking). */
export async function GET(req: Request, ctx: RouteContext<"/api/files/[...path]">) {
  const { path: segs } = await ctx.params;
  if (!segs?.length || !ALLOWED_ROOTS.has(segs[0])) return new Response("not found", { status: 404 });
  const abs = path.resolve(DATA_DIR, ...segs.map(decodeURIComponent));
  if (!abs.startsWith(DATA_DIR + path.sep)) return new Response("forbidden", { status: 403 });
  let st: fs.Stats;
  try {
    st = await fsp.stat(abs);
  } catch {
    return new Response("not found", { status: 404 });
  }
  if (!st.isFile()) return new Response("not found", { status: 404 });

  const type = mimeFor(abs);
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": segs[0] === "refs" ? "no-cache" : "private, max-age=3600",
    "Last-Modified": st.mtime.toUTCString(),
  };

  const range = req.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(parseInt(m[2], 10), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${st.size}` } });
      headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
      headers["Content-Length"] = String(end - start + 1);
      const stream = Readable.toWeb(fs.createReadStream(abs, { start, end })) as ReadableStream;
      return new Response(stream, { status: 206, headers });
    }
  }
  headers["Content-Length"] = String(st.size);
  const stream = Readable.toWeb(fs.createReadStream(abs)) as ReadableStream;
  return new Response(stream, { status: 200, headers });
}
