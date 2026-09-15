// Small helpers for route handlers.

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function ok(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

/** Wrap a handler so thrown errors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response> | Response) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : e instanceof Error && "status" in e && typeof e.status === "number" ? e.status : 500;
      const message = e instanceof Error ? e.message : String(e);
      if (status === 500) console.error("[api]", e);
      return Response.json({ error: message }, { status });
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function required<T>(v: T | undefined | null, name: string): T {
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) throw new HttpError(400, `${name} is required`);
  return v;
}
