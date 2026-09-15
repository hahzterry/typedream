#!/usr/bin/env tsx
/**
 * Director CLI. Talks to the running harness server over HTTP so there is a single writer.
 *
 *   npm run h -- <command> [args] [--flag value]
 *
 * Commands:
 *   status                              overview of assets / scenes / shots / active takes
 *   project [--name X] [--style "..."] [--model seedance-2.0] [--ratio 16:9] [--res 720p] [--provider fal|mock]
 *   asset add <kind> <name> [--tag t] [--desc "..."] [--ref path ...]
 *   asset list | asset rm <idOrTag>
 *   ref add <asset> <path|url> [--label l]
 *   ref gen <asset> [--prompt "..."] [--n 2] [--size 1024x1536] [--label l]
 *   scene add <title> [--desc "..."] [--location <asset>]
 *   shot add <scene> <title> --prompt "..." [--duration 8] [--assets a,b] [--ratio] [--res] [--model] [--seed]
 *   shot edit <id> [--prompt ...] [--title ...] [--duration ...]
 *   shot show <id>                      resolved prompt + refs + takes
 *   shot rm <id>
 *   gen <shotId|all|scene:<id>> [--n 1] [--seed s] [--provider mock]
 *   watch                               block until no takes are active, printing changes
 *   takes [shotId]                      list takes
 *   take select <takeId> | take rm <takeId> | take rate <takeId> <1-5>
 *   import <script.json>                bulk import (see HARNESS.md)
 *   assemble [--skip-missing] [--name X]
 *   poll                                force a poll pass
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.HARNESS_URL ?? "http://localhost:3000";

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
    throw new Error(`Cannot reach harness at ${BASE}. Start it with: npm run dev  (${e instanceof Error ? e.message : e})`);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

type State = import("../lib/types").Db;
const state = () => api<State>("/api/state");
const s = (f: Flags, k: string) => (typeof f[k] === "string" ? (f[k] as string) : undefined);
const num = (f: Flags, k: string) => (s(f, k) !== undefined ? Number(s(f, k)) : undefined);

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

const pad = (v: unknown, n: number) => String(v ?? "").padEnd(n).slice(0, n);

async function main() {
  const { pos, flags } = parse(process.argv.slice(2));
  const [cmd, sub, ...rest] = pos;

  switch (cmd) {
    case undefined:
    case "help":
      console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^\/\*\*\n/, "").replace(/^ \* ?/gm, ""));
      return;

    case "status": {
      const db = await state();
      const active = db.takes.filter((t) => t.status === "queued" || t.status === "running");
      console.log(`${db.project.name} · provider=${db.project.provider} model=${db.project.model} ${db.project.aspectRatio} ${db.project.resolution}`);
      console.log(`assets: ${db.assets.length}  scenes: ${db.scenes.length}  shots: ${db.shots.length}  takes: ${db.takes.length} (${active.length} active)`);
      for (const sc of [...db.scenes].sort((a, b) => a.order - b.order)) {
        console.log(`\nS${sc.order} ${sc.title}  [${sc.id}]`);
        for (const sh of db.shots.filter((x) => x.sceneId === sc.id).sort((a, b) => a.order - b.order)) {
          const takes = db.takes.filter((t) => t.shotId === sh.id);
          const sel = takes.find((t) => t.id === sh.selectedTakeId);
          const latest = takes[takes.length - 1];
          const st = sel?.status === "done" ? "done" : latest?.status ?? "draft";
          console.log(`  ${pad(sh.id, 12)} ${pad(st, 9)} ${pad(takes.length + " takes", 9)} ${sh.title}`);
        }
      }
      return;
    }

    case "project": {
      const body: Record<string, unknown> = {};
      if (s(flags, "name")) body.name = s(flags, "name");
      if (s(flags, "style")) body.stylePrompt = s(flags, "style");
      if (s(flags, "suffix")) body.suffixPrompt = s(flags, "suffix");
      if (s(flags, "model")) body.model = s(flags, "model");
      if (s(flags, "ratio")) body.aspectRatio = s(flags, "ratio");
      if (s(flags, "res")) body.resolution = s(flags, "res");
      if (s(flags, "provider")) body.provider = s(flags, "provider");
      if (s(flags, "audio")) body.generateAudio = s(flags, "audio") === "on";
      if (num(flags, "max-refs") !== undefined) body.maxRefsPerAsset = num(flags, "max-refs");
      const p = Object.keys(body).length ? await api("/api/project", "PATCH", body) : await api("/api/project");
      console.log(JSON.stringify(p, null, 2));
      return;
    }

    case "asset": {
      if (sub === "list") {
        const db = await state();
        for (const a of db.assets) console.log(`${pad(a.id, 12)} ${pad(a.kind, 10)} @${pad(a.tag, 16)} ${a.refs.length} refs  ${a.name}`);
        return;
      }
      if (sub === "add") {
        const [kind, name] = rest;
        if (!kind || !name) throw new Error("usage: asset add <kind> <name>");
        const a = await api<{ id: string; tag: string }>("/api/assets", "POST", { kind, name, tag: s(flags, "tag"), description: s(flags, "desc"), notes: s(flags, "notes") });
        console.log(`created ${a.id} @${a.tag}`);
        const refs = process.argv.slice(2).flatMap((x, i, arr) => (x === "--ref" ? [arr[i + 1]] : []));
        for (const r of refs) {
          await api(`/api/assets/${a.id}/refs`, "POST", { path: path.resolve(r) });
          console.log(`  + ref ${r}`);
        }
        return;
      }
      if (sub === "rm") {
        const db = await state();
        const a = resolveAsset(db, rest[0]);
        await api(`/api/assets/${a.id}`, "DELETE");
        console.log(`deleted ${a.name}`);
        return;
      }
      if (sub === "edit") {
        const db = await state();
        const a = resolveAsset(db, rest[0]);
        await api(`/api/assets/${a.id}`, "PATCH", { name: s(flags, "name"), tag: s(flags, "tag"), description: s(flags, "desc"), notes: s(flags, "notes") });
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
        const r = await api<{ id: string }>(`/api/assets/${a.id}/refs`, "POST", { ...body, label: s(flags, "label") });
        console.log(`added ref ${r.id} to ${a.name}`);
        return;
      }
      if (sub === "gen") {
        const [w, h] = (s(flags, "size") ?? "1024x1024").split("x").map(Number);
        console.log(`generating ${num(flags, "n") ?? 1} image(s) for ${a.name}…`);
        const out = await api<{ prompt: string; refs: { id: string; file: string }[] }>(`/api/assets/${a.id}/refs/generate`, "POST", {
          prompt: s(flags, "prompt"),
          n: num(flags, "n"),
          width: w,
          height: h,
          label: s(flags, "label"),
          seed: num(flags, "seed"),
        });
        for (const r of out.refs) console.log(`  + ${r.id}  ${BASE}/api/files/refs/${a.id}/${r.file}`);
        return;
      }
      if (sub === "rm") {
        await api(`/api/assets/${a.id}/refs/${rest[1]}`, "DELETE");
        console.log("ok");
        return;
      }
      throw new Error("ref: add | gen | rm");
    }

    case "scene": {
      if (sub === "add") {
        const sc = await api<{ id: string }>("/api/scenes", "POST", { title: rest[0], description: s(flags, "desc"), locationId: s(flags, "location") });
        console.log(`created scene ${sc.id}`);
        return;
      }
      if (sub === "rm") {
        const db = await state();
        const sc = resolveScene(db, rest[0]);
        await api(`/api/scenes/${sc.id}`, "DELETE");
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
        const sh = await api<{ id: string }>("/api/shots", "POST", {
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
      if (sub === "edit") {
        const sh = resolveShot(db, rest[0]);
        const patch: Record<string, unknown> = {};
        if (s(flags, "prompt")) patch.prompt = s(flags, "prompt");
        if (s(flags, "title")) patch.title = s(flags, "title");
        if (s(flags, "duration")) patch.duration = s(flags, "duration") === "auto" ? "auto" : num(flags, "duration");
        if (s(flags, "ratio")) patch.aspectRatio = s(flags, "ratio");
        if (s(flags, "res")) patch.resolution = s(flags, "res");
        if (s(flags, "model")) patch.model = s(flags, "model");
        if (s(flags, "seed")) patch.seed = num(flags, "seed");
        if (s(flags, "notes")) patch.notes = s(flags, "notes");
        await api(`/api/shots/${sh.id}`, "PATCH", patch);
        console.log("ok");
        return;
      }
      if (sub === "show") {
        const sh = resolveShot(db, rest[0]);
        const d = await api<{ preview: { prompt: string; warnings: string[]; refs: { assetName: string; label: string; imageIndex: number }[] }; takes: import("../lib/types").Take[] }>(`/api/shots/${sh.id}`);
        console.log(`# ${sh.title} [${sh.id}]\n`);
        console.log(d.preview.prompt);
        console.log("\nrefs:");
        for (const r of d.preview.refs) console.log(`  @Image${r.imageIndex} = ${r.assetName} (${r.label})`);
        for (const w of d.preview.warnings) console.log(`  ! ${w}`);
        console.log("\ntakes:");
        for (const t of d.takes) console.log(`  ${t.id} take${t.n} ${pad(t.status, 9)} ${t.videoFile ? BASE + "/api/files/output/" + t.videoFile : t.error ?? ""}${sh.selectedTakeId === t.id ? "  [selected]" : ""}`);
        return;
      }
      if (sub === "rm") {
        const sh = resolveShot(db, rest[0]);
        await api(`/api/shots/${sh.id}`, "DELETE");
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
      if (target === "all") {
        const r = await api<{ shotId: string; takes?: { id: string; status: string; error?: string }[]; error?: string }[]>("/api/generate", "POST", { onlyDraft: true, count });
        for (const x of r) console.log(`${x.shotId}: ${x.error ?? x.takes!.map((t) => `${t.id} ${t.status}${t.error ? " " + t.error : ""}`).join(", ")}`);
        if (!r.length) console.log("nothing to generate (no draft shots)");
      } else if (target.startsWith("scene:")) {
        const sc = resolveScene(db, target.slice(6));
        const r = await api<{ shotId: string; error?: string; takes?: { id: string; status: string }[] }[]>("/api/generate", "POST", { sceneId: sc.id, onlyDraft: !flags.force, count });
        for (const x of r) console.log(`${x.shotId}: ${x.error ?? x.takes!.map((t) => `${t.id} ${t.status}`).join(", ")}`);
      } else {
        const sh = resolveShot(db, target);
        const takes = await api<{ id: string; status: string; error?: string; estCostUsd?: number }[]>(`/api/shots/${sh.id}/generate`, "POST", { count, seed: num(flags, "seed"), provider });
        for (const t of takes) console.log(`${t.id} ${t.status} ${t.error ?? ""} ${t.estCostUsd !== undefined ? `≈$${t.estCostUsd}` : ""}`);
      }
      if (flags.watch) await watch();
      return;
    }

    case "watch":
      await watch();
      return;

    case "poll": {
      console.log(JSON.stringify(await api("/api/poll", "POST")));
      return;
    }

    case "takes": {
      const db = await state();
      const list = sub ? db.takes.filter((t) => t.shotId === resolveShot(db, sub).id) : db.takes;
      for (const t of list) {
        const sh = db.shots.find((x) => x.id === t.shotId);
        console.log(`${pad(t.id, 12)} ${pad(t.status, 9)} take${t.n} ${pad(sh?.title, 28)} ${t.videoFile ? BASE + "/api/files/output/" + t.videoFile : t.error ?? ""}${sh?.selectedTakeId === t.id ? "  [selected]" : ""}`);
      }
      return;
    }

    case "take": {
      if (sub === "select") {
        await api(`/api/takes/${rest[0]}`, "PATCH", { select: true });
        console.log("ok");
        return;
      }
      if (sub === "rm" || sub === "cancel") {
        console.log(JSON.stringify(await api(`/api/takes/${rest[0]}`, "DELETE")));
        return;
      }
      if (sub === "rate") {
        await api(`/api/takes/${rest[0]}`, "PATCH", { rating: Number(rest[1]) });
        console.log("ok");
        return;
      }
      throw new Error("take: select | rm | cancel | rate");
    }

    case "import": {
      const file = sub;
      if (!file) throw new Error("usage: import <script.json>");
      const script = JSON.parse(fs.readFileSync(file, "utf8"));
      // resolve relative ref paths against the script file's directory
      const dir = path.dirname(path.resolve(file));
      for (const a of script.assets ?? []) a.refs = (a.refs ?? []).map((r: string) => (path.isAbsolute(r) ? r : path.join(dir, r)));
      const report = await api("/api/import", "POST", script);
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    case "assemble": {
      const r = await api<{ file: string; skipped: string[] }>("/api/assemble", "POST", { skipMissing: !!flags["skip-missing"], name: s(flags, "name") });
      console.log(`rendered ${BASE}/api/files/assembly/${r.file}${r.skipped.length ? `  (skipped ${r.skipped.length} shots)` : ""}`);
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
          console.log(`${new Date().toLocaleTimeString()}  ${t.id} take${t.n} ${pad(sh?.title, 28)} ${t.status}${t.error ? "  " + t.error : ""}${t.videoFile ? "  " + BASE + "/api/files/output/" + t.videoFile : ""}`);
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
