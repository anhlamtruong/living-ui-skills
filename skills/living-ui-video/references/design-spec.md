# Design spec template (`video/DESIGN.md`)

Copy everything below the line into `video/DESIGN.md` and replace each `<...>`. Every clip author, human or agent, reads this file first, so every adjective should come with a number. The worked example's filled-in version is [video/DESIGN.md](https://github.com/anhlamtruong/portfolio-anh/blob/a5d165123922ea5c7fd645c4d0701554b1e4df8f/video/DESIGN.md).

---

# <Site name> videos: shared design spec

Every video on <site> is a HyperFrames project in this folder, rendered to MP4 and encoded into `<public/videos/>`. They play muted, looping and inline inside the site's own design, so they must look like part of the page, not like ads dropped onto it.

## Look

Take these from the site's design tokens, not from memory.

- Ground `<#bg>`. Panels `<#panel>`. Lines `<#line>`, strong lines `<#line-strong>`.
- Text `<#text>`, muted `<#muted>`, dim `<#dim>` (keep dim text at 4.5:1 on the ground or above; HyperFrames' contrast check enforces it).
- Accent `<#accent>`. Secondary accent `<#accent-2>`.
- Category colors (nodes, packets, highlights): `<name #hex>`, `<name #hex>`, ...
- Background texture: `<e.g. 1 px grid lines rgba(...) every 96 px, finer every 24 px>`.
- Panels: `<border, radius, shadow rules>`.
- Feel in one line: `<e.g. precise, technical, calm motion with sharp moments>`.

## Type

Copy the font files into each project's `assets/fonts/` and declare them:

```css
@font-face { font-family: "<Display>"; src: url("assets/fonts/<file>") format("<woff2>"); font-weight: <100 900>; }
@font-face { font-family: "<Mono>"; src: url("assets/fonts/<file>") format("<woff2>"); font-weight: <100 900>; }
```

- Headlines: `<family weight tracking>`. Accent words: `<family/style>`.
- Labels, logs, numbers: `<mono family, sizes>`.
- Minimum sizes, from the play scale (see Sizes): labels ≥ `<22>` px on a 1280 canvas, ≥ `<18>` px on a 1920 band; key numbers ≥ `<64>` px.

## Motion rules

- **Seamless loop.** The frame after the last frame is frame 0: draw from time, use periods that divide the length, and move marquees exactly one tile per loop. Verify with `loop-seam.mjs`.
- **Frame 0 is the poster.** It must look complete; start mid-action.
- **Eases:** `<power3.out / expo.out>` for arrivals, `<power2.inOut>` for travel, `<sine.inOut>` for ambient drift. `<Banned eases, e.g. elastic, bounce, spin>`.
- **One to three focal motions at a time;** everything else is subtle.
- **Deterministic only:** no `Math.random` without a seed, no `Date.now`, no timers, no `repeat: -1`.

## Banned

List what must not appear and why. Two kinds of entries belong here:

1. **Originality.** If the visual idea came from someone else's site or reel, name its distinctive set pieces and ban them. A general style is fine to share; a recognizable signature move isn't, and unlicensed work is not yours to reuse. Example entries: `<an intro where things orbit a center>`, `<a specific counter or badge treatment>`.
2. **Taste and context.** `No cursor sprites (the page has its own)`, `no sound`, `no real company logos except as plain text`, `<anything that fights the page>`.

## Sizes and outputs

| name | canvas | length | plays on page (approx. width) | scale | budget (mp4) |
| --- | --- | --- | --- | --- | --- |
| `<showreel>` | 1280×800 | 10 s | `<hero window, ~480 px>` | `<0.38>` | ≤ 1.5 MB |
| `<card-a>` | 1280×800 | 6 s | `<project card, ~540 px>` | `<0.42>` | ≤ 800 KB |
| `<band-a>` | 1920×320 | 8 s | `<full width, ~1440 px>` | `<0.75>` | ≤ 900 KB |

- What the page draws on top of each slot (keep it free): `<e.g. card badge top-left, index top-right, ~300×130 px each>`.
- Bands are cropped with `object-fit: cover` on phones: key content in the middle `<640>` px, edges fade to `<#bg>`.
- All at 30 fps. The page draws the frame: no outer border, no rounded corners in the video.
- Keep clear of the page's overlays: the top corners (badges, index numbers) and the bottom-right corner, where the pause toggle sits.

## Work loop

```bash
# in video/<name>/
npx -y hyperframes@<version> check --json          # fix every error
npx -y hyperframes@<version> snapshot --at 0,1.5,3,4.5
npx -y hyperframes@<version> render -q delivery -w 6 -o <short-path>/<name>.mp4
node <path-to>/loop-seam.mjs <short-path>/<name>.mp4
node <path-to>/encode.mjs <short-path>/<name>.mp4 <name> --out <public/videos>
```

FFmpeg must be on PATH (or set `FFMPEG`).
