# Example: delivery-pipeline band

A complete HyperFrames project: 1920×320, 8 s, 30 fps, a seamless loop. Five stations (plan, code, test, review, ship) sit on a rail, and packets flow through them, taking each station's color as they pass. It is the `band-pipeline` clip from [lamanhtruong.com](https://www.lamanhtruong.com), hand-built without registry blocks, and `npx hyperframes check` passes on it.

```
band/
├── index.html               root: 1920×320, 8 s, mounts one scene
└── compositions/flow.html   the scene: everything drawn from time t
```

## Run it

1. Copy this folder to `video/<your-name>/` in your project.
2. Add the font: `assets/fonts/GeistMonoVF.woff` (Geist Mono, SIL Open Font License, from [vercel/geist-font](https://github.com/vercel/geist-font) or the `geist` npm package). Or change the `@font-face` at the top of `flow.html` to your own mono font.
3. With FFmpeg on PATH:

   ```bash
   npx -y hyperframes@<version> check --json
   npx -y hyperframes@<version> render -q delivery -o <short-path>/band.mp4
   node ../../scripts/loop-seam.mjs <short-path>/band.mp4
   node ../../scripts/encode.mjs <short-path>/band.mp4 band --out public/videos
   ```

   The paths assume the skill layout; adjust them to wherever the scripts live in your project.

## What to change

- **Palette:** the CSS variables on `#root` and the RGB arrays at the top of the script (`GROUND`, `LINE`, `MUTED`, `LABEL`, and each station's `c`).
- **Stations:** the five `.pl-station` blocks (label, index, `left`) and the matching `STATIONS` entries. Keep them inside the middle ~640 px so phones, which crop the sides, still see all of them.
- **Traffic:** `PACKETS` (head offset and length inside one 960 px tile) and `PHASE` (which stations are lit at frame 0).
- **Speed and length:** keep `V * DUR === TILE` (120 px/s × 8 s = 960 px). Change one and you must change another, or the loop jumps.

The ids `flow` in `index.html` (host `id`, `data-composition-id`) and in the scene (`data-composition-id`, `window.__timelines["flow"]`) must stay identical. Rename all four together.
