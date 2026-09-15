# typedream

Local production harness for making an anime with ByteDance's Seedance 2.x video models via fal.ai.

- **Projects** — one per anime: name, description, style and generation defaults.
- **Characters & assets** with reference images (upload, or generate with Seedream) and an appearance lock sent with every shot.
- **Storyboard** of scenes and shots; `@tag` references in prompts become `@ImageN` reference images automatically.
- **Takes**: multiple generations per shot, background polling, auto-download, select/rate, seed reuse.
- **Assemble** selected takes into one mp4 with ffmpeg.
- **CLI** for a director (human or Claude) to drive everything; the web UI is the monitor.
- **Mock provider** to rehearse the whole pipeline for free.

```bash
npm install
cp .env.example .env.local   # add FAL_KEY
npm run dev                  # open http://localhost:3000, create a project
npm run td -- project list   # CLI
```

Read [DIRECTOR.md](DIRECTOR.md) for the workflow, CLI reference, script format and prompt guide.

Requires Node 20+ and ffmpeg on PATH.
