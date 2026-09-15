# Seedance Harness — director manual

A local production harness for making an anime with ByteDance's **Seedance 2.x** video models.
The web UI (Next.js) is the monitor; the CLI is the control surface the director (Claude) drives.

```
characters / locations / style refs  ──►  shots (prompt + @tags)  ──►  takes (Seedance jobs)  ──►  assemble (ffmpeg)
```

## 1. Setup

```bash
npm install
cp .env.example .env.local     # add FAL_KEY
npm run dev                    # http://localhost:3000  (server also polls jobs in the background)
```

- `FAL_KEY` — fal.ai key. Seedance video + Seedream reference images both go through fal.
- `HARNESS_PROVIDER=mock` — free local mode: ffmpeg test-pattern videos, no credits spent. Use it to rehearse a whole episode's pipeline.
- ffmpeg must be on PATH (used for assembly and mock mode).

All state lives in `./data/` (gitignored): `db.json`, `refs/<assetId>/*.png`, `output/*.mp4`, `assembly/*.mp4`.

## 2. Concepts

| Thing | What it is |
|---|---|
| **Project** | Global style prompt, suffix prompt, default model/ratio/resolution, provider. |
| **Asset** | `character`, `location`, `prop`, or `style`. Has a `@tag`, a **description** (appearance lock, sent to the model) and **reference images**. |
| **Scene** | Ordered group of shots. Can have a default location asset whose refs are attached to every shot. |
| **Shot** | One generation unit: a prompt (action · camera · dialogue) using `@tags`, plus duration / ratio / resolution / model overrides. |
| **Take** | One Seedance job for a shot. A shot can have many takes; one is **selected** for assembly. |

### How a prompt is assembled
For each take the harness builds the final prompt as:

1. Project **style prompt**
2. **Reference legend** — `@Image1 = Aki Tanaka (character). <description> Keep face, hair, eyes, outfit and proportions exactly as shown…` for every asset used
3. The **shot prompt** with each `@tag` rewritten to `Name (@ImageN)`
4. Project **suffix prompt** (e.g. "no subtitles, no watermark")

Images are attached in legend order. Max 9 images per generation; `maxRefsPerAsset` (default 2) controls how many refs each asset contributes. Use `shot show <id>` (or the shot page) to see exactly what will be sent before spending credits.

## 3. CLI (`npm run h -- …`)

The server must be running. `HARNESS_URL` overrides `http://localhost:3000`.

```
status
project [--name X] [--style "…"] [--suffix "…"] [--model seedance-2.0|seedance-2.0-fast|seedance-2.5]
        [--ratio 16:9] [--res 480p|720p|1080p] [--provider fal|ark|mock] [--audio on|off] [--max-refs 2]

asset add <kind> <name> [--tag t] [--desc "…"] [--notes "…"] [--ref path.png ...]
asset list | asset edit <asset> [--desc …] | asset rm <asset>
ref add <asset> <path|url> [--label l]
ref gen <asset> [--prompt "…"] [--n 2] [--size 1024x1536] [--label l] [--seed s]   # Seedream image gen

scene add <title> [--desc "…"] [--location <asset>]
scene rm <scene>
shot add <scene> <title> --prompt "…" | --prompt-file f.txt [--duration 8|auto] [--assets a,b] [--ratio] [--res] [--model] [--seed] [--notes]
shot edit <shot> [--prompt …] [--title …] [--duration …] …
shot show <shot>            # resolved prompt, refs, takes
shot rm <shot>

gen all [--n 1] [--watch]                 # every shot with no live/finished take
gen scene:<scene> [--force] [--watch]     # --force: even shots that already have takes
gen <shot> [--n 3] [--seed s] [--provider mock] [--watch]
watch                                     # block until nothing is active, print transitions
takes [shot] | take select <take> | take rate <take> 1-5 | take rm|cancel <take>

import script.json                        # bulk create (below)
assemble [--skip-missing] [--name X]      # concat selected takes -> data/assembly/*.mp4
poll                                      # force one poll pass
```

`<asset>` / `<scene>` / `<shot>` accept id, tag/title, or `s1` for scene order.

## 4. Script import format

```json
{
  "project": { "name": "Paper Sky", "stylePrompt": "…", "aspectRatio": "16:9", "resolution": "720p" },
  "assets": [
    { "kind": "character", "name": "Aki Tanaka", "tag": "aki",
      "description": "17, slim, shoulder-length black hair with a red clip, amber eyes, navy blazer, red ribbon tie.",
      "refs": ["refs/aki_front.png", "refs/aki_side.png"] },
    { "kind": "location", "name": "Rooftop", "description": "School rooftop, golden hour, chain-link fence, city skyline." }
  ],
  "scenes": [
    { "title": "1 — Rooftop", "location": "rooftop", "shots": [
      { "title": "1A wide", "prompt": "Wide establishing shot of @rooftop. @aki stands at the fence, back to camera. Slow drift left.", "duration": 5 },
      { "title": "1B close", "prompt": "Close-up on @aki. She turns, wind lifts her hair, says softly: 'I thought you'd forgotten.' Shallow depth of field.", "duration": 6 }
    ]}
  ]
}
```

Relative ref paths resolve against the script file's directory. Assets whose tag already exists are skipped with a warning.

## 5. Writing Seedance 2.0 prompts for anime

Formula: **subject + action + setting + camera + style + refs + constraints**. Concrete beats vague.

- **Lock identity through refs, not adjectives.** Put the look in the asset description once; in shots, just say what the character *does*. The legend already tells the model to keep the design.
- **One idea per shot, 4–10 s.** Seedance handles a single continuous action and one camera move best. Multi-shot sequences inside one clip work ("cut to…") but consistency drops; prefer more shots.
- **Camera language:** "static tripod shot", "slow push-in", "handheld tracking shot from behind", "low angle", "rack focus from A to B", "whip pan". Say "no camera shake" when you want stillness.
- **Anime-specific:** name the shot grammar — "hold on a still frame with only hair and cloth moving", "speed lines", "background pan with parallax", "sakuga-style fluid action", "limited animation on twos". Mention lighting (rim light, golden hour, overcast flat light).
- **Dialogue & audio:** `generate_audio` is on by default. Write lines in quotes with delivery notes: `She says quietly: "..."`. Add ambience: "distant traffic, wind, school chimes". Say "no background music" if you want to score it yourself.
- **Reference images:** clean character sheets on plain backgrounds work best. Real human faces are rejected by the model — everything must be stylized.
- **Negatives go in the suffix prompt:** subtitles, captions, watermarks, extra characters, text.
- **Duration:** shots default to `auto`; set it explicitly for timing-critical cuts. 2.0 supports 4–15 s, 2.5 up to 30 s.
- **Seeds:** re-use a good take's seed (`shot edit --seed`) when refining a prompt for that shot.

Iteration loop: `gen <shot> --n 2 --watch` → review in the UI → `take select` → adjust prompt/seed → repeat. Assemble whenever you want to see the cut so far.

## 6. Cost

fal list price (Sept 2026): Seedance 2.0 ≈ $0.30 / output-second at 720p, fast tier ≈ $0.24; 1080p costs more, 480p less. A 6 s shot ≈ $1.80. The UI shows a running estimate. BytePlus ModelArk is in the same range but bills in tokens; it is wired as the `ark` provider (untested) if you ever want to compare.

## 7. HTTP API (what the CLI and UI use)

```
GET    /api/state                         everything
GET|PATCH /api/project
GET|POST /api/assets      PATCH|DELETE /api/assets/:id
POST   /api/assets/:id/refs               multipart files[] | {path} | {url}
PATCH|DELETE /api/assets/:id/refs/:refId
POST   /api/assets/:id/refs/generate      {prompt?, n?, width?, height?, seed?, label?}
GET|POST /api/scenes      PATCH|DELETE /api/scenes/:id   (PATCH accepts {shotOrder: [ids]})
GET|POST /api/shots       GET|PATCH|DELETE /api/shots/:id  (GET includes resolved prompt preview)
POST   /api/shots/:id/generate            {count?, seed?, provider?}
POST   /api/generate                      {shotIds?|sceneId?, onlyDraft?, count?}
GET|PATCH|DELETE /api/takes/:id           PATCH {select?, rating?, notes?}; DELETE cancels if active
POST   /api/poll
POST   /api/import
GET|POST /api/assemble
GET    /api/files/{refs|output|assembly}/…   (Range supported)
```
