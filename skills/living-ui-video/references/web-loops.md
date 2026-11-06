# HyperFrames for web loops

HyperFrames' own skills (`/hyperframes`, `/hyperframes-cli`, `/hyperframes-registry`) are the authority on the composition format, and you should read them first. This file covers only what changes when the output is a short muted clip that loops forever inside a web page.

## Contents

- [The few contract rules that bite hardest](#the-few-contract-rules-that-bite-hardest)
- [Making the loop seamless](#making-the-loop-seamless)
- [Frame 0 is the poster](#frame-0-is-the-poster)
- [Readability at page scale](#readability-at-page-scale)
- [Leave room for the page](#leave-room-for-the-page)
- [Pattern: draw from time with one tween](#pattern-draw-from-time-with-one-tween)
- [Rendering on any machine](#rendering-on-any-machine)
- [Encoding choices](#encoding-choices)

## The few contract rules that bite hardest

A summary, not a substitute; the HyperFrames skill states them precisely.

- Each composition builds one paused GSAP timeline and registers it as `window.__timelines["<id>"]`. The host element's `id`, the scene root's `data-composition-id` and that key must be the same string. If they differ, renders stall for ~45 s per scene and come out frozen.
- Timed elements carry `class="clip"`, `data-start` and `data-duration`. The root's `data-duration` is the video length.
- Nothing may depend on wall-clock time or chance: no `Date.now()`, unseeded `Math.random()`, `setTimeout`, `requestAnimationFrame` loops, `repeat: -1` or network fetches. The renderer seeks the timeline to each frame; anything outside it drifts or flickers.
- Fonts other than the bundled families need `@font-face` pointing at a file inside the project (`assets/fonts/...`, no leading slash).
- Scene files keep their styles, markup and scripts inside `<template>` and style their root as `#root`.
- `npx hyperframes check --json` catches most of this, each finding with a `Fix:` line. Make it clean before rendering.

## Making the loop seamless

A crossfade at the loop point always shows. Build the clip so the frame after the last frame is frame 0.

1. **Pure function of time.** Write a `renderAt(t)` that sets every visual from `t` alone, and drive it from one linear tween over the whole duration (see the pattern below). If `renderAt(duration)` equals `renderAt(0)`, the loop is seamless by construction.
2. **Periods that divide the length.** A pulse every 2 s works in an 8 s clip; every 3 s doesn't. A metric strip that shows 4 values for 2.5 s each fills a 10 s loop exactly.
3. **Marquees move exactly one tile.** For content that scrolls, `speed × duration = tile width`. The worked-example pipeline band moves 120 px/s for 8 s across a 960 px tile, and draws 3 copies of the tile so the 1920 px canvas is always covered.
4. **No one-way camera moves.** A slow push-in over 6 s jumps back at the seam. Use a sine drift (`Math.sin(2π t / duration)`) for gentle movement on screenshots.
5. **State that wraps.** Counters that climb need to be back at their start value by the end. Either show a value that cycles, or let the climb happen mid-loop and hold the final value across the seam.
6. **Text that types in** must be fully typed or fully gone at the seam, and the same at both ends.

Check it with `scripts/loop-seam.mjs` on the delivery render. It compares the seam with ordinary one-frame steps across the clip, and exits 2 on a jump.

## Frame 0 is the poster

The page shows `<name>.webp` (frame 0) until the video has data, and keeps showing it when autoplay is refused (iOS Low Power Mode, data saver, some in-app browsers). So:

- Frame 0 must look like a finished, interesting frame. Start the loop mid-action, never at an empty grid that fills in.
- The poster is also what animations around the page may use. In the worked example, the page's build animation drags the poster into place before the video plays.
- Check frame 0 on purpose: `npx hyperframes snapshot --at 0` and look at it.

## Readability at page scale

The page shows the clip at `scale = slot width on screen / canvas width`.

| slot | canvas | on screen | scale | 22 px label lands at |
| --- | --- | --- | --- | --- |
| hero window | 1280 | ~440–480 px | ~0.36 | ~8 px (too small for long text) |
| project card | 1280 | ~520–540 px desktop, ~350 px phone | 0.42 / 0.27 | ~9 px / ~6 px |
| full-width band | 1920 | ~1440 px laptop | 0.75 | ~16 px |

Rules that came out of this:

- Mono labels at least 22 px on a 1280 canvas, 18 px on a 1920 band.
- Key numbers at least 64 px (they're what people actually read).
- On phones, small text in cards turns into texture. That's fine as long as the shapes and the big numbers still tell the story. Don't hang the meaning on small text.
- Fewer, larger elements beat a crowded scene. A loop runs beside copy people are trying to read.

## Leave room for the page

- Ask what the page overlays on the slot. Project cards in the worked example draw a badge chip at the top-left and an index at the top-right, about 300×130 px each in canvas terms. Keep those areas free of important content; put your own mono label at the bottom-left.
- Don't draw an outer frame, rounded corners or a drop shadow. The page draws the frame, and doubled borders look wrong.
- Bands get `object-fit: cover` and lose their sides on phones: keep the key content in the middle third, make the sides pure continuation, and fade the far edges to the page background.
- No cursor sprites. If the page has its own animated cursors, fake ones in the video compete with them; if it doesn't, they look like a screen recording.
- No audio. The clip plays muted, and an audio track only costs bytes; `encode.mjs` strips it.

## Pattern: draw from time with one tween

For anything procedural (packets, waveforms, scrolling traces, counters), skip per-element tweens and draw everything from a single clock. It's easier to make periodic and easier to reason about.

```html
<script>
  (function () {
    const DUR = 8; // seconds, equal to the host's data-duration

    function renderAt(t) {
      // set transforms, colors and text from t alone
    }

    const clock = { t: 0 };
    const tl = gsap.timeline({ paused: true });
    tl.to(clock, { t: DUR, duration: DUR, ease: "none", onUpdate: () => renderAt(clock.t) }, 0);
    renderAt(0); // frame 0 is correct before the first seek
    window.__timelines = window.__timelines || {};
    window.__timelines["<scene-id>"] = tl;
  })();
</script>
```

Build any repeated DOM (packets, rows) synchronously before registering the timeline, with stable ids. `assets/band/compositions/flow.html` is a complete example.

For hand-staged motion (cards sliding in, a ring filling), regular `fromTo` tweens on a timeline are fine. Make sure the last tween returns everything to the frame-0 state just before the end.

## Rendering on any machine

- **FFmpeg missing.** Install npm binaries into a tools folder and put them on PATH for the session:
  - bash:

    ```bash
    npm i --prefix .tools ffmpeg-static @ffprobe-installer/ffprobe
    FFDIR="$(node -p "require('path').dirname(require('./.tools/node_modules/ffmpeg-static'))")"
    FPDIR="$(node -p "require('path').dirname(require('./.tools/node_modules/@ffprobe-installer/ffprobe').path)")"
    command -v cygpath >/dev/null && FFDIR="$(cygpath "$FFDIR")" && FPDIR="$(cygpath "$FPDIR")"  # Git Bash on Windows
    export PATH="$FFDIR:$FPDIR:$PATH"
    ```

  - PowerShell:

    ```powershell
    $env:PATH = "$(Split-Path (node -p "require('./.tools/node_modules/ffmpeg-static')"));$(Split-Path (node -p "require('./.tools/node_modules/@ffprobe-installer/ffprobe').path"));$env:PATH"
    ```

  `npx hyperframes doctor` should then show FFmpeg and FFprobe as found. Docker isn't required for local renders.
- **`ENAMETOOLONG` on Windows.** The renderer's temp names push deep paths past 260 characters. Render with `-o C:\hf\<name>.mp4` (any short folder) and copy the file into the project afterwards.
- **Parallel renders.** Each worker is a Chrome process (~256 MB). Three agents rendering at once with `-w 6` each was fine on a 24-core, 64 GB machine. Lower `-w` on smaller ones.
- **Pin the CLI.** `npx -y hyperframes@<version>` in every command, so all clips use the same runtime and the same GSAP.
- **Snapshots** go to `snapshots/` inside the project. Look at them with your image viewer or Read tool; they are the fastest feedback loop you have.

## Encoding choices

`scripts/encode.mjs` turns the delivery render (`-q delivery`, near-lossless) into the web files:

- **MP4:** H.264 High, `yuv420p`, `+faststart` (the index sits at the front, so playback starts before the download finishes), CRF 26 by default.
- **WebM:** VP9, constant quality, CRF 42 by default. Browsers try it first.
- **WebP poster:** frame 0, quality 80, usually 10–45 KB.
- `--width 1280` scales down while encoding if you rendered larger.

Sizes from the worked example: 165–740 KB per clip, 5.4 MB for seven. Flat motion graphics compress very well. Screenshots with fine text and dense scrolling labels cost the most. If the WebM comes out larger than the MP4, the script warns you; raise `--webm-crf` by 4 and re-run.
