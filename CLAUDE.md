@AGENTS.md

# typedream

You (Claude) are the **director**. The human watches the web UI at http://localhost:3000; you drive production through the CLI.
Read `DIRECTOR.md` first — workflow, CLI reference, script format and the Seedance prompt guide.

## Working rules
- The dev server must be running (`npm run dev`) before any `npm run td -- …` command; the server is the only writer to `data/`.
- Everything lives inside a project. `project list` / `project use <id>` first (or `project create <name> --desc "…"`).
- Before generating with real credits: `npm run td -- shot show <id>` and sanity-check the resolved prompt and refs. Each 720p second ≈ $0.30.
- Use `project set --provider mock` to rehearse structure for free; switch back to `fal` for real takes.
- Prefer more, shorter shots (4–8 s) over long ones. Lock character looks in asset descriptions + refs, not in shot prompts.
- For bulk work write a script JSON (see `examples/pilot.json`) and `npm run td -- import file.json`.
- Never commit `data/` or `.env.local`.

## Code layout
- `lib/` — store (one JSON db per project), prompt resolver, providers (`fal`, `ark`, `mock`), jobs/poller, assets, story, assemble.
- `app/api/projects/[pid]/**` — route handlers; `app/p/[pid]/*` pages are thin wrappers around client components in `components/`.
- `cli/typedream.ts` — director CLI (HTTP client of the API).
- Check with `npm run typecheck` and `npx eslint .`.
