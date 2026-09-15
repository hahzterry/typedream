#!/usr/bin/env tsx
/**
 * typedream director CLI. Talks to the running server over HTTP (single writer).
 *
 *   npm run td -- <command> [args] [--flag value]
 *
 * Projects
 *   project list
 *   project create <name> [--desc "..."]          creates and selects it
 *   project use <id>                              select the current project
 *   project show                                  current project settings
 *   project set [--name X] [--desc "..."] [--style "..."] [--suffix "..."] [--model seedance-2.0|seedance-2.0-fast|seedance-2.5]
 *               [--ratio 16:9] [--res 480p|720p|1080p] [--provider fal|ark|mock] [--audio on|off] [--max-refs 2]
 *   project rm <id>
 *
 * Inside the current project (or pass --project <id>)
 *   status
 *   asset add <kind> <name> [--tag t] [--desc "..."] [--notes "..."] [--ref path ...]
 *   asset list | asset edit <asset> [--desc ...] | asset rm <asset>
 *   ref add <asset> <path|url> [--label l]
 *   ref gen <asset> [--prompt "..."] [--n 2] [--size 1024x1536] [--label l] [--seed s]
 *   scene add <title> [--desc "..."] [--location <asset>]
 *   scene rm <scene>
 *   shot add <scene> <title> --prompt "..." | --prompt-file f.txt [--duration 8|auto] [--assets a,b] [--ratio] [--res] [--model] [--seed] [--notes]
 *   shot edit <shot> [--prompt ...] [--title ...] [--duration ...] ...
 *   shot show <shot>                              resolved prompt + refs + takes
 *   shot rm <shot>
 *   gen all [--n 1] [--watch]                     every shot with no live/finished take
 *   gen scene:<scene> [--force] [--watch]
 *   gen <shot> [--n 3] [--seed s] [--provider mock] [--watch]
 *   watch                                         block until nothing is active
 *   takes [shot] | take select <take> | take rate <take> 1-5 | take rm|cancel <take>
 *   import <script.json>                          bulk create assets/scenes/shots
 *   assemble [--skip-missing] [--name X]
 *   poll
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.TYPEDREAM_URL ?? "http://localhost:3000";

type Flags = Record<string, string | boolean>;
function parse(argv: string[]) {
  const pos: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[k] = next;
        i++;
      } else flags[k] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

async function api<T = unknown>(p: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + p, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new Error(`Cannot reach typedream at ${BASE}. Start it with: npm run dev  (${e instanceof Error ? e.message : e})`);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

type State = import("../lib/types").Db;
type Take = import("../lib/types").Take;
const s = (f: Flags, k: string) => (typeof f[k] === "string" ? (f[k] as string) : undefined);
const num = (f: Flags, k: string) => (s(f, k) !== undefined ? Number(s(f, k)) : undefined);
const pad = (v: unknown, n: number) => String(v ?? "").padEnd(n).slice(0, n);

let PID = "";
const P = (p = "") => `/api/projects/${PID}${p}`;
const state = () => api<State>(P());

async function resolveProject(flags: Flags) {
  const explicit = s(flags, "project") ?? process.env.TYPEDREAM_PROJECT;
  if (explicit) return explicit;
  const { id } = await api<{ id: string | null }>("/api/current");
  if (!id) throw new Error("No current project. Run: project list, then project use <id>  (or project create <name>)");
  return id;
}

function resolveAsset(db: State, q: string) {
  const a = db.assets.find((x) => x.id === q || x.tag === q || x.name.toLowerCase() === q.toLowerCase());
  if (!a) throw new Error(`asset "${q}" not found`);
  return a;
}
function resolveScene(db: State, q: string) {
  const sc = db.scenes.find((x) => x.id === q || x.title.toLowerCase() === q.toLowerCase() || `s${x.order}` === q.toLowerCase());
  if (!sc) throw new Error(`scene "${q}" not found`);
  return sc;
}
function resolveShot(db: State, q: string) {
  const sh = db.shots.find((x) => x.id === q || x.title.toLowerCase() === q.toLowerCase());
  if (!sh) throw new Error(`shot "${q}" not found`);
  return sh;
}

async function main() {
  const { pos, flags } = parse(process.argv.slice(2));
  const [cmd, sub, ...rest] = pos;

  if (cmd === undefined || cmd === "help") {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^\/\*\*\n/, "").replace(/^ \* ?/gm, ""));
    return;
  }

  // ---- project-level commands (no current project needed) ----
  if (cmd === "project") {
    if (sub === "list") {
      const cur = (await api<{ id: string | null }>("/api/current")).id;
      const list = await api<import("../lib/types").ProjectSummary[]>("/api/projects");
      if (!list.length) console.log("no projects yet — project create <name>");
      for (const p of list) console.log(`${p.id === cur ? "*" : " "} ${pad(p.id, 24)} ${pad(p.provider + "/" + p.model, 24)} ${p.shots} shots ${p.takesDone} done${p.takesActive ? ` ${p.takesActive} active` : ""}  ${p.name}`);
      return;
    }
    if (sub === "create") {
      const name = rest[0];
      if (!name) throw new Error("usage: project create <name> [--desc ...]");
      const body: Record<string, unknown> = { name, description: s(flags, "desc") };
      if (s(flags, "style")) body.stylePrompt = s(flags, "style");
      if (s(flags, "provider")) body.provider = s(flags, "provider");
      if (s(flags, "model")) body.model = s(flags, "model");
      const p = await api<{ id: string }>("/api/projects", "POST", body);
      await api("/api/current", "PUT", { id: p.id });
      console.log(`created and selected project ${p.id}  ${BASE}/p/${p.id}`);
      return;
    }
    if (sub === "use") {
      await api("/api/current", "PUT", { id: rest[0] });
      console.log(`current project: ${rest[0]}`);
      return;
    }
    if (sub === "rm") {
      if (!rest[0]) throw new Error("usage: project rm <id>");
      await api(`/api/projects/${rest[0]}`, "DELETE");
      console.log("deleted");
      return;
    }
  }

  PID = await resolveProject(flags);

  switch (cmd) {
    case "project": {
      if (sub === "show") {
        console.log(JSON.stringify((await state()).project, null, 2));
        return;
      }
      if (sub === "set") {
        const body: Record<string, unknown> = {};
        if (s(flags, "name")) body.name = s(flags, "name");
        if (s(flags, "desc")) body.description = s(flags, "desc");
        if (s(flags, "style")) body.stylePrompt = s(flags, "style");
        if (s(flags, "suffix")) body.suffixPrompt = s(flags, "suffix");
        if (s(flags, "model")) body.model = s(flags, "model");
        if (s(flags, "ratio")) body.aspectRatio = s(flags, "ratio");
        if (s(flags, "res")) body.resolution = s(flags, "res");
        if (s(flags, "provider")) body.provider = s(flags, "provider");
        if (s(flags, "audio")) body.generateAudio = s(flags, "audio") === "on";
        if (num(flags, "max-refs") !== undefined) body.maxRefsPerAsset = num(flags, "max-refs");
        console.log(JSON.stringify(await api(P(), "PATCH", body), null, 2));
        return;
      }
      throw new Error("project: list | create | use | show | set | rm");
    }

    case "status": {
      const db = await state();
      const active = db.takes.filter((t) => t.status === "queued" || t.status === "running");
      console.log(`${db.project.name} [${db.project.id}] · ${db.project.provider} · ${db.project.model} · ${db.project.aspectRatio} · ${db.project.resolution}`);
      if (db.project.description) console.log(db.project.description);
      console.log(`assets: ${db.assets.length}  scenes: ${db.scenes.length}  shots: ${db.shots.length}  takes: ${db.takes.length} (${active.length} active)`);
      for (const sc of [...db.scenes].sort((a, b) => a.order - b.order)) {
        console.log(`\nS${sc.order} ${sc.title}  [${sc.id}]`);
        for (const sh of db.shots.filter((x) => x.sceneId === sc.id).sort((a, b) => a.order - b.order)) {
          const takes = db.takes.filter((t) => t.shotId === sh.id);
          const sel = takes.find((t) => t.id === sh.selectedTakeId);
          const latest = takes[takes.length - 1];
          const st = sel?.status === "done" ? "done" : (latest?.status ?? "draft");
          console.log(`  ${pad(sh.id, 12)} ${pad(st, 9)} ${pad(takes.length + " takes", 9)} ${sh.title}`);
        }
      }
      return;
    }

    case "asset": {
      if (sub === "list") {
        for (const a of (await state()).assets) console.log(`${pad(a.id, 12)} ${pad(a.kind, 10)} @${pad(a.tag, 16)} ${a.refs.length} refs  ${a.name}`);
        return;
      }
      if (sub === "add") {
        const [kind, name] = rest;
        if (!kind || !name) throw new Error("usage: asset add <kind> <name>");
        const a = await api<{ id: string; tag: string }>(P("/assets"), "POST", { kind, name, tag: s(flags, "tag"), description: s(flags, "desc"), notes: s(flags, "notes") });
        console.log(`created ${a.id} @${a.tag}`);
        const refs = process.argv.slice(2).flatMap((x, i, arr) => (x === "--ref" ? [arr[i + 1]] : []));
        for (const r of refs) {
          await api(P(`/assets/${a.id}/refs`), "POST", { path: path.resolve(r) });
          console.log(`  + ref ${r}`);
        }
        return;
      }
      const db = await state();
      const a = resolveAsset(db, rest[0] ?? "");
      if (sub === "rm") {
        await api(P(`/assets/${a.id}`), "DELETE");
        console.log(`deleted ${a.name}`);
        return;
      }
      if (sub === "edit") {
        await api(P(`/assets/${a.id}`), "PATCH", { name: s(flags, "name"), tag: s(flags, "tag"), description: s(flags, "desc"), notes: s(flags, "notes") });
        console.log("ok");
        return;
      }
      throw new Error("asset: add | list | rm | edit");
    }

    case "ref": {
      const db = await state();
      const a = resolveAsset(db, rest[0] ?? "");
      if (sub === "add") {
        const src = rest[1];
        if (!src) throw new Error("usage: ref add <asset> <path|url>");
        const body = /^https?:\/\//.test(src) ? { url: src } : { path: path.resolve(src) };
        const r = await api<{ id: string }>(P(`/assets/${a.id}/refs`), "POST", { ...body, label: s(flags, "label") });
        console.log(`added ref ${r.id} to ${a.name}`);
        return;
      }
      if (sub === "gen") {
        const [w, h] = (s(flags, "size") ?? "1024x1024").split("x").map(Number);
        console.log(`generating ${num(flags, "n") ?? 1} image(s) for ${a.name}…`);
        const out = await api<{ refs: { id: string; file: string }[] }>(P(`/assets/${a.id}/refs/generate`), "POST", {
          prompt: s(flags, "prompt"),
          n: num(flags, "n"),
          width: w,
          height: h,
          label: s(flags, "label"),
          seed: num(flags, "seed"),
        });
        for (const r of out.refs) console.log(`  + ${r.id}  ${BASE}${P(`/files/refs/${a.id}/${r.file}`)}`);
        return;
      }
      if (sub === "rm") {
        await api(P(`/assets/${a.id}/refs/${rest[1]}`), "DELETE");
        console.log("ok");
        return;
      }
      throw new Error("ref: add | gen | rm");
    }

    case "scene": {
      if (sub === "add") {
        const sc = await api<{ id: string }>(P("/scenes"), "POST", { title: rest[0], description: s(flags, "desc"), locationId: s(flags, "location") });
        console.log(`created scene ${sc.id}`);
        return;
      }
      if (sub === "rm") {
        const sc = resolveScene(await state(), rest[0]);
        await api(P(`/scenes/${sc.id}`), "DELETE");
        console.log("deleted");
        return;
      }
      throw new Error("scene: add | rm");
    }

    case "shot": {
      const db = await state();
      if (sub === "add") {
        const [sceneQ, title] = rest;
        const sc = resolveScene(db, sceneQ);
        const prompt = s(flags, "prompt") ?? (s(flags, "prompt-file") ? fs.readFileSync(s(flags, "prompt-file")!, "utf8") : undefined);
        if (!title || !prompt) throw new Error("usage: shot add <scene> <title> --prompt '...'");
        const sh = await api<{ id: string }>(P("/shots"), "POST", {
          sceneId: sc.id,
          title,
          prompt,
          assetIds: s(flags, "assets")?.split(",").map((x) => x.trim()),
          duration: s(flags, "duration") === "auto" ? "auto" : num(flags, "duration"),
          aspectRatio: s(flags, "ratio"),
          resolution: s(flags, "res"),
          model: s(flags, "model"),
          seed: num(flags, "seed"),
          notes: s(flags, "notes"),
        });
        console.log(`created shot ${sh.id}`);
        return;
      }
      const sh = resolveShot(db, rest[0] ?? "");
      if (sub === "edit") {
        const patch: Record<string, unknown> = {};
        if (s(flags, "prompt")) patch.prompt = s(flags, "prompt");
        if (s(flags, "prompt-file")) patch.prompt = fs.readFileSync(s(flags, "prompt-file")!, "utf8");
        if (s(flags, "title")) patch.title = s(flags, "title");
        if (s(flags, "duration")) patch.duration = s(flags, "duration") === "auto" ? "auto" : num(flags, "duration");
        if (s(flags, "ratio")) patch.aspectRatio = s(flags, "ratio");
        if (s(flags, "res")) patch.resolution = s(flags, "res");
        if (s(flags, "model")) patch.model = s(flags, "model");
        if (s(flags, "seed")) patch.seed = num(flags, "seed");
        if (s(flags, "notes")) patch.notes = s(flags, "notes");
        await api(P(`/shots/${sh.id}`), "PATCH", patch);
        console.log("ok");
        return;
      }
      if (sub === "show") {
        const d = await api<{ preview: { prompt: string; warnings: string[]; refs: { assetName: string; label: string; imageIndex: number }[] }; takes: Take[] }>(P(`/shots/${sh.id}`));
        console.log(`# ${sh.title} [${sh.id}]  ${BASE}/p/${PID}/shots/${sh.id}\n`);
        console.log(d.preview.prompt);
        console.log("\nrefs:");
        for (const r of d.preview.refs) console.log(`  @Image${r.imageIndex} = ${r.assetName} (${r.label})`);
        for (const w of d.preview.warnings) console.log(`  ! ${w}`);
        console.log("\ntakes:");
        for (const t of d.takes) console.log(`  ${t.id} take${t.n} ${pad(t.status, 9)} ${t.videoFile ? BASE + P("/files/output/" + t.videoFile) : (t.error ?? "")}${sh.selectedTakeId === t.id ? "  [selected]" : ""}`);
        return;
      }
      if (sub === "rm") {
        await api(P(`/shots/${sh.id}`), "DELETE");
        console.log("deleted");
        return;
      }
      throw new Error("shot: add | edit | show | rm");
    }

    case "gen": {
      const db = await state();
      const target = sub ?? "all";
      const count = num(flags, "n");
      const provider = s(flags, "provider");
      type R = { shotId: string; takes?: { id: string; status: string; error?: string }[]; error?: string };
      if (target === "all") {
        const r = await api<R[]>(P("/generate"), "POST", { onlyDraft: true, count });
        for (const x of r) console.log(`${x.shotId}: ${x.error ?? x.takes!.map((t) => `${t.id} ${t.status}${t.error ? " " + t.error : ""}`).join(", ")}`);
        if (!r.length) console.log("nothing to generate (no draft shots)");
      } else if (target.startsWith("scene:")) {
        const sc = resolveScene(db, target.slice(6));
        const r = await api<R[]>(P("/generate"), "POST", { sceneId: sc.id, onlyDraft: !flags.force, count });
        for (const x of r) console.log(`${x.shotId}: ${x.error ?? x.takes!.map((t) => `${t.id} ${t.status}`).join(", ")}`);
      } else {
        const sh = resolveShot(db, target);
        const takes = await api<Take[]>(P(`/shots/${sh.id}/generate`), "POST", { count, seed: num(flags, "seed"), provider });
        for (const t of takes) console.log(`${t.id} ${t.status} ${t.error ?? ""} ${t.estCostUsd !== undefined ? `≈$${t.estCostUsd}` : ""}`);
      }
      if (flags.watch) await watch();
      return;
    }

    case "watch":
      await watch();
      return;

    case "poll":
      console.log(JSON.stringify(await api(P("/poll"), "POST")));
      return;

    case "takes": {
      const db = await state();
      const list = sub ? db.takes.filter((t) => t.shotId === resolveShot(db, sub).id) : db.takes;
      for (const t of list) {
        const sh = db.shots.find((x) => x.id === t.shotId);
        console.log(`${pad(t.id, 12)} ${pad(t.status, 9)} take${t.n} ${pad(sh?.title, 28)} ${t.videoFile ? BASE + P("/files/output/" + t.videoFile) : (t.error ?? "")}${sh?.selectedTakeId === t.id ? "  [selected]" : ""}`);
      }
      return;
    }

    case "take": {
      if (sub === "select") {
        await api(P(`/takes/${rest[0]}`), "PATCH", { select: true });
        console.log("ok");
        return;
      }
      if (sub === "rm" || sub === "cancel") {
        console.log(JSON.stringify(await api(P(`/takes/${rest[0]}`), "DELETE")));
        return;
      }
      if (sub === "rate") {
        await api(P(`/takes/${rest[0]}`), "PATCH", { rating: Number(rest[1]) });
        console.log("ok");
        return;
      }
      throw new Error("take: select | rm | cancel | rate");
    }

    case "import": {
      const file = sub;
      if (!file) throw new Error("usage: import <script.json>");
      const script = JSON.parse(fs.readFileSync(file, "utf8"));
      const dir = path.dirname(path.resolve(file));
      for (const a of script.assets ?? []) a.refs = (a.refs ?? []).map((r: string) => (path.isAbsolute(r) ? r : path.join(dir, r)));
      console.log(JSON.stringify(await api(P("/import"), "POST", script), null, 2));
      return;
    }

    case "assemble": {
      const r = await api<{ file: string; skipped: string[] }>(P("/assemble"), "POST", { skipMissing: !!flags["skip-missing"], name: s(flags, "name") });
      console.log(`rendered ${BASE}${P("/files/assembly/" + r.file)}${r.skipped.length ? `  (skipped ${r.skipped.length} shots)` : ""}`);
      return;
    }

    default:
      throw new Error(`unknown command "${cmd}" — run with no args for help`);
  }
}

async function watch() {
  const seen = new Map<string, string>();
  for (;;) {
    const db = await state();
    const active = db.takes.filter((t) => t.status === "queued" || t.status === "running");
    for (const t of db.takes) {
      const prev = seen.get(t.id);
      if (prev !== t.status) {
        const sh = db.shots.find((x) => x.id === t.shotId);
        if (prev !== undefined || active.includes(t)) {
          console.log(`${new Date().toLocaleTimeString()}  ${t.id} take${t.n} ${pad(sh?.title, 28)} ${t.status}${t.error ? "  " + t.error : ""}${t.videoFile ? "  " + BASE + P("/files/output/" + t.videoFile) : ""}`);
        }
        seen.set(t.id, t.status);
      }
    }
    if (!active.length) {
      console.log("no active takes");
      return;
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}

main().catch((e) => {
  console.error(`error: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
