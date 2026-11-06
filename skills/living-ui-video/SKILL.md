---
name: living-ui-video
description: Make short looping motion-graphics videos with HyperFrames (HTML rendered to MP4) and embed them in a React or Next.js site so they never slow the page - hero showreels, project demo loops, full-width bands between sections. Covers the shared design spec, seamless loops, frame-0 posters, rendering on any machine (FFmpeg from npm), encoding to WebM + MP4 + WebP poster, a LoopVideo component that paints the poster first, warms clips up while the page is idle and plays only what is on screen, cache headers, and Playwright checks. Use it whenever someone wants video or motion on a website, says a page feels static or flat, asks for a showreel, a product demo loop, animated project previews, a background or autoplay muted loop, HyperFrames for the web, or is fighting heavy, janky or slow website video, even if they never say HyperFrames.
---

# Looping website video with HyperFrames

Video is the cheapest way to make a page feel alive after its first paint, and the easiest way to wreck its load time. This skill does both halves:

1. **Author** each clip as HTML with [HyperFrames](https://github.com/heygen-com/hyperframes) (HeyGen, Apache-2.0). It renders a paused GSAP timeline frame by frame into a deterministic MP4, so the site's own colors, fonts and grid carry straight into the video.
2. **Embed** it with a small client component. The poster paints with the HTML, clips download one at a time once the page is idle, and only the clips on screen play. A statically rendered page stays static.

Worked example: [lamanhtruong.com](https://www.lamanhtruong.com) ships 7 clips, about 5.4 MB in total, and the homepage is still prerendered:

| clip | slot on the page | canvas | length | mp4 |
| --- | --- | --- | --- | --- |
| showreel | hero "preview" window, ~480 px wide | 1280×800 | 10 s | 721 KB |
| proj-orchestrator | featured project card, ~540 px | 1280×800 | 6 s | 244 KB |
| proj-aihire | featured project card | 1280×800 | 6 s | 165 KB |
| proj-crushie | featured project card, real screenshot | 1280×800 | 6 s | 380 KB |
| proj-finhack | featured project card, real screenshot | 1280×800 | 6 s | 459 KB |
| band-pipeline | full-width strip between sections | 1920×320 | 8 s | 233 KB |
| band-trace | full-width strip between sections | 1920×320 | 8 s | 595 KB |

Sources: [video/](https://github.com/anhlamtruong/portfolio-anh/tree/a5d165123922ea5c7fd645c4d0701554b1e4df8f/video) (one HyperFrames project per clip plus the shared [DESIGN.md](https://github.com/anhlamtruong/portfolio-anh/blob/a5d165123922ea5c7fd645c4d0701554b1e4df8f/video/DESIGN.md)), and [loop-video.tsx](https://github.com/anhlamtruong/portfolio-anh/blob/a5d165123922ea5c7fd645c4d0701554b1e4df8f/src/app/%28homepage%29/_sections/loop-video.tsx) for the embedding.

## Before you start

- **HyperFrames skills.** Install HeyGen's own skills and read them before writing a composition. They own the composition contract, motion and layout rules, and the CLI; this skill only covers what is specific to looping web clips.
  - Standalone: `npx hyperframes skills update`
  - Claude Code plugin: `claude plugin marketplace add heygen-com/hyperframes` then `claude plugin install hyperframes@hyperframes`
- **Node 22+.** Pin the CLI version in every command (`npx -y hyperframes@<version> ...`) so all clips render with the same runtime.
- **FFmpeg.** Run `npx -y hyperframes@<version> doctor`. If FFmpeg or FFprobe shows ✗, don't change the user's system unless they ask. Put npm-provided binaries on PATH for the session instead:

  ```bash
  npm i --prefix .tools ffmpeg-static @ffprobe-installer/ffprobe
  FFDIR="$(node -p "require('path').dirname(require('./.tools/node_modules/ffmpeg-static'))")"
  FPDIR="$(node -p "require('path').dirname(require('./.tools/node_modules/@ffprobe-installer/ffprobe').path)")"
  command -v cygpath >/dev/null && FFDIR="$(cygpath "$FFDIR")" && FPDIR="$(cygpath "$FPDIR")"  # Git Bash on Windows
  export PATH="$FFDIR:$FPDIR:$PATH"
  ```

  PowerShell and more detail: [references/web-loops.md](references/web-loops.md#rendering-on-any-machine). Keep `.tools/` out of git. Chrome is used for capture; `doctor` finds an installed Chrome or downloads one.

## Workflow

### 1. Pick the slots before the content

Decide where each clip plays and how wide it will be on screen. That sets the canvas, the length, and how big text must be.

| slot | canvas | length | notes |
| --- | --- | --- | --- |
| hero window | 1280×800 (16:10) | 8–10 s | sits next to the headline, so don't repeat the headline in the video |
| card media | 1280×800 (16:10) | 6 s | the card already has the title and text below; show the thing working |
| full-width band | 1920×320 (6:1) | 8 s | decorative; phones crop the sides, so keep key content in the middle ~640 px |

Readability depends on the display scale (slot width / canvas width). At ~0.4× (a 1280 canvas in a 500 px card), 22 px labels land at ~9 px, the floor for mono text. Big numbers need 64 px or more. Write the scale for each slot into the design spec so every author checks against it.

Ask what the page draws on top of each slot. Project cards often put a badge in one top corner and an index in the other, and `LoopVideo`'s pause toggle sits in the bottom-right corner (always visible on touch screens). Keep those corners free of important content: about 300×130 px of a 1280×800 canvas at the top, and 300×110 px at the bottom right.

### 2. Write one shared design spec

Copy [references/design-spec.md](references/design-spec.md) to `video/DESIGN.md` and fill it from the site's own tokens: background, panels, lines, text, accent, role colors, fonts, grid spacing. One spec makes the clips read as a set, and lets several agents work in parallel without drifting.

### 3. One HyperFrames project per clip

```bash
cd video && npx -y hyperframes@<version> init <name> --skip-skills --skill=hyperframes
```

- Copy the site's font files into `<name>/assets/fonts/` and declare them with `@font-face`. Only HyperFrames' bundled families resolve by name.
- `init` also writes `AGENTS.md` and `CLAUDE.md`. Delete them if the HyperFrames skills are installed globally, so the repo doesn't carry seven copies.
- Commit the sources (re-rendering later is the whole point of "video as code"). Ignore the rest:

  ```gitignore
  /video/*/renders/
  /video/*/snapshots/
  /video/*/node_modules/
  /video/*/.hyperframes/
  ```

- On Vercel, add `video/` to `.vercelignore`: the sources aren't needed to build the site.

### 4. Author for a loop

Read [references/web-loops.md](references/web-loops.md) for the details, and [assets/band/](assets/band/) for a complete, check-clean example. The rules that matter most:

- **Draw every frame as a pure function of time.** Schedules repeat on periods that divide the clip length, and marquees move exactly one tile per loop (speed × duration = tile width). Then the state at `t = duration` equals `t = 0` by construction, with no crossfade.
- **Frame 0 is the poster.** It's what people see before playback starts, and what they see forever if autoplay is refused. It must already look complete, never an empty grid waiting to build up. Start the loop mid-action.
- **Determinism.** No `Date.now()`, no unseeded random, no timers, no `repeat: -1`, no network. HyperFrames seeks the timeline; anything else drifts.
- **No cursor sprites, no audio.** Pages that already animate cursors look busy with fake ones in the video; web loops play muted anyway.
- **Calm by default.** One to three focal motions at a time, ambient drift elsewhere. A clip loops forever next to text people are reading.

### 5. Check, look, then check the seam

```bash
npx -y hyperframes@<version> check --json            # fix every error, weigh each warning
npx -y hyperframes@<version> snapshot --at 0,1.5,3,4.5   # then open the PNGs and look
```

Look at the snapshots at the size they'll play. Shrink them to the slot width if needed. After rendering (step 6), prove the loop on the delivery render:

```bash
node scripts/loop-seam.mjs <short-path>/<name>.mp4
```

The script compares the jump from the last frame back to frame 0 with normal one-frame steps sampled across the clip. On the seven worked-example clips the seam was 0.3–1.2× the biggest normal step; clips cut short to fake a jump measured 1.6–4.5×.

Run it on the delivery render, not the web encode: at high CRF, keyframe-versus-predicted-frame noise can outweigh a few pixels of motion and raise false alarms.

### 6. Render and encode

```bash
npx -y hyperframes@<version> render -q delivery -w 6 -o <short-path>/<name>.mp4
node scripts/encode.mjs <short-path>/<name>.mp4 <name> --out public/videos --width 1280
```

- **Short output path.** On Windows a deep project path plus HyperFrames' temp folder names can pass 260 characters and fail with `ENAMETOOLONG`. Render to a short folder (for example `C:\hf\`), then copy the MP4 into `video/<name>/renders/`.
- **What `encode.mjs` writes.** `<name>.webm` (VP9, tried first), `<name>.mp4` (H.264 + faststart, for Safari) and `<name>.webp` (frame 0 as the poster). No audio track.
- **Size budgets that worked:** ≤ 1.5 MB for a 10 s hero clip, ≤ 800–900 KB for 6–8 s clips. Flat motion graphics usually land well under that.
- **WebM vs MP4 size.** Browsers pick the WebM first, so it must not be the heavier file. If it is, the script says so; raise `--webm-crf` (42 was right for most flat graphics, 33 for very sparse bands).

### 7. Embed

Copy [assets/loop-video.tsx](assets/loop-video.tsx), [assets/video.css](assets/video.css) and [assets/video-band.tsx](assets/video-band.tsx) next to the page sections. `LoopVideo` is the only client component involved, so the page itself stays a server component and can still be prerendered.

```tsx
// Card media: informative, so it gets a label and a pause toggle.
<div className="relative aspect-[16/10] overflow-hidden">
  <LoopVideo name="proj-orchestrator" label="Orchestrator: animated preview" width={1280} height={800} toggle className="h-full w-full" />
</div>

// Full-width band between sections: decorative.
<VideoBand name="band-pipeline" reel="reel 01 · pipeline" caption="plan → code → test → review → ship" />
```

The hero "preview window" pattern (window chrome around the showreel) is in [references/embedding.md](references/embedding.md), along with why each loading choice is there:

- The poster comes first.
- An idle warm-up queue loads clips one at a time in page order, and is skipped on Save-Data and 2G.
- An IntersectionObserver plays and pauses clips.
- `muted` is set from JS because React doesn't always write the attribute.
- Clips longer than 5 s get a pause toggle (WCAG 2.2.2).

If the page has its own entrance animation that measures or drags elements in, give it the poster frame to work with, not a blank box. The worked example's swarm engine loads `video[poster]` as an image for its drag-in card ([scan.ts](https://github.com/anhlamtruong/portfolio-anh/blob/a5d165123922ea5c7fd645c4d0701554b1e4df8f/src/components/swarm/scan.ts)).

### 8. Serve with a long cache

```ts
// next.config.ts
async headers() {
  return [{ source: "/videos/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" }] }];
}
```

`LoopVideo` appends `?v=<version>` to every file. Bump `VIDEO_VERSION` (or pass `version`) whenever you re-render, so returning visitors don't keep a stale clip for a month.

### 9. Verify in a real browser

Run [scripts/check-videos.mjs](scripts/check-videos.mjs) against the dev or preview URL (details in [references/verification.md](references/verification.md)). It checks that:

- every clip reaches `readyState` 4 once the page is idle;
- only clips near the viewport are playing at each scroll stop;
- there is no horizontal overflow at 390 px wide.

Then look at a phone and at Safari yourself: headless Chromium can't tell you about iOS Low Power Mode, which refuses autoplay and leaves the poster up. That is the reason frame 0 has to look finished.

## Several clips at once: one agent per group

Rendering is slow and each clip needs real design attention, so split the work when there are more than two clips:

- Write `video/DESIGN.md` first; it's the contract every agent shares.
- Give each agent its own folders (`video/<name>/`) and outputs (`public/videos/<name>.*`), and tell it which files it must not touch. Agents editing the same files in parallel overwrite each other.
- Paste the brief from [references/agent-brief.md](references/agent-brief.md). It carries the FFmpeg PATH line, the short render path, the "no questions, render directly" instruction and the report format.
- Run the page integration (`LoopVideo`, bands, headers) yourself while they render. It only needs the clip names and sizes.
- When they report, tile the posters into one image and look at them together before shipping (command in the brief template). A set reads as a set or it doesn't.

## Troubleshooting

| symptom | cause and fix |
| --- | --- |
| `doctor`: FFmpeg ✗ | Put npm `ffmpeg-static` + `@ffprobe-installer/ffprobe` on PATH (see Before you start). |
| `render` fails with `ENAMETOOLONG` | The path is too long on Windows. Render to a short folder and copy the file in. |
| Render waits ~45 s per scene, then shows static frames | The host id, the scene root's `data-composition-id` and the `window.__timelines` key don't match. Make all three the same. |
| A jump at the loop point (`loop-seam.mjs` says JUMP) | Something isn't periodic in the clip length: a speed × duration that isn't a whole tile, a schedule period that doesn't divide it, or a one-way camera push. Use a sine drift instead. |
| Clip never plays on iPhone | Autoplay was refused (Low Power Mode) or `playsinline` is missing. `LoopVideo` sets both attributes; the poster is the fallback, so frame 0 must look finished. |
| WebM bigger than MP4 | Raise `--webm-crf` by 4 and re-encode. |
| Text unreadable on the page | The canvas is too large for the slot. Raise the font sizes, or render a smaller canvas for that slot. |
| The page got slower | Check `preload="none"` survived and only one clip loads at a time (Network panel). Never put `autoplay` or `preload="auto"` in the server HTML. |

## Files in this skill

- `scripts/encode.mjs`: render → `.webm` + `.mp4` + `.webp` poster, with size report and a WebM-vs-MP4 warning.
- `scripts/loop-seam.mjs`: measures the loop seam against normal frame steps (exit code 2 on a jump).
- `scripts/check-videos.mjs`: Playwright check for loading, on-screen-only playback and phone overflow.
- `assets/loop-video.tsx`, `assets/video.css`, `assets/video-band.tsx`: the embedding components (theme them with the `--lv-*` CSS variables).
- `assets/band/`: a complete HyperFrames project (1920×320, 8 s seamless delivery-pipeline band) to copy from. Fonts aren't included; see its README.
- `references/web-loops.md`: loop techniques, poster rules, readability math, render troubleshooting.
- `references/embedding.md`: the loading strategy, layout patterns, caching, accessibility.
- `references/design-spec.md`: the shared `video/DESIGN.md` to fill in.
- `references/agent-brief.md`: the brief for one clip-rendering subagent.
- `references/verification.md`: what to check before shipping, automated and by hand.
