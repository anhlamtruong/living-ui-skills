#!/usr/bin/env node
// Part of living-ui-skills (MIT). Adapt freely.
// Encode one HyperFrames render into the three files a web page loads.
//
//   <out>/<name>.mp4   H.264, no audio track, +faststart (Safari and fallback)
//   <out>/<name>.webm  VP9, no audio track (usually smaller; Chrome, Firefox, Edge)
//   <out>/<name>.webp  poster = frame 0 (paints before any video bytes arrive)
//
// Usage:
//   node encode.mjs <render.mp4> <name> [--out public/videos] [--width 1280] [--crf 26] [--webm-crf 42]
//
// FFmpeg comes from $FFMPEG, else `ffmpeg` on PATH. Without a system install:
//   npm i -D ffmpeg-static
//   FFMPEG="$(node -p "require('ffmpeg-static')")" node encode.mjs ...

import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flags = new Map();
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg.startsWith("--")) {
    flags.set(arg.slice(2), argv[i + 1]);
    i++;
  } else {
    positional.push(arg);
  }
}

const [input, name] = positional;
if (!input || !name) {
  console.error(
    "Usage: node encode.mjs <render.mp4> <name> [--out public/videos] [--width 1280] [--crf 26] [--webm-crf 42]",
  );
  process.exit(1);
}

const ffmpeg = process.env.FFMPEG || "ffmpeg";
const outDir = path.resolve(flags.get("out") ?? "public/videos");
const width = flags.get("width");
const crf = flags.get("crf") ?? "26";
const webmCrf = flags.get("webm-crf") ?? "42";

mkdirSync(outDir, { recursive: true });
const scale = width ? ["-vf", `scale=${width}:-2:flags=lanczos`] : [];

function encode(label, args, out) {
  const result = spawnSync(
    ffmpeg,
    ["-y", "-hide_banner", "-loglevel", "error", "-i", input, ...args, out],
    { stdio: "inherit" },
  );
  if (result.error) {
    console.error(`Could not run ffmpeg (${ffmpeg}): ${result.error.message}`);
    console.error("Install it, or set FFMPEG to a binary (see the header of this file).");
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${label} encode failed`);
    process.exit(result.status ?? 1);
  }
  const bytes = statSync(out).size;
  console.log(`${label.padEnd(5)} ${path.relative(process.cwd(), out)}  ${(bytes / 1024).toFixed(0)} KB`);
  return bytes;
}

const mp4 = encode(
  "mp4",
  [...scale, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", crf, "-pix_fmt", "yuv420p",
    "-profile:v", "high", "-movflags", "+faststart"],
  path.join(outDir, `${name}.mp4`),
);
const webm = encode(
  "webm",
  [...scale, "-an", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", webmCrf, "-row-mt", "1",
    "-deadline", "good", "-cpu-used", "1", "-pix_fmt", "yuv420p"],
  path.join(outDir, `${name}.webm`),
);
encode(
  "webp",
  [...scale, "-frames:v", "1", "-c:v", "libwebp", "-quality", "80"],
  path.join(outDir, `${name}.webp`),
);

// Browsers pick the webm first, so it should not be the heavier file.
if (webm > mp4) {
  console.warn(
    `note: the webm (${(webm / 1024).toFixed(0)} KB) is larger than the mp4 (${(mp4 / 1024).toFixed(0)} KB). ` +
      `Re-run with a higher --webm-crf (try ${Number(webmCrf) + 4}).`,
  );
}
