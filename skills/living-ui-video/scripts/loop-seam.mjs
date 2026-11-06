#!/usr/bin/env node
// Part of living-ui-skills (MIT). Adapt freely.
// Is the loop seamless? Measures the jump from the last frame back to frame 0
// and compares it with ordinary one-frame steps sampled across the clip
// (FFmpeg SSIM, 1 = identical; change = 1 - SSIM). A seamless loop's seam is
// about as big a change as the biggest normal step. Real jumps measured 2-5x.
//
// Usage: node loop-seam.mjs <render.mp4> [--every 5] [--ratio 1.25]
//   --every  sample a step pair every N frames (default 5)
//   --ratio  how much bigger than the biggest normal step the seam may be (default 1.25)
// FFmpeg comes from $FFMPEG, else `ffmpeg` on PATH.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (key, fallback) => {
  const i = argv.indexOf(`--${key}`);
  return i >= 0 ? Number(argv[i + 1]) : fallback;
};
const input = argv.find((arg, i) => !arg.startsWith("--") && !argv[i - 1]?.startsWith("--"));
const every = Math.max(3, flag("every", 5));
const ratio = flag("ratio", 1.25);

if (!input) {
  console.error("Usage: node loop-seam.mjs <render.mp4> [--every 5] [--ratio 1.25]");
  process.exit(1);
}

const ffmpeg = process.env.FFMPEG || "ffmpeg";

function run(args) {
  const result = spawnSync(ffmpeg, ["-hide_banner", ...args], { encoding: "utf8" });
  if (result.error) {
    console.error(`Could not run ffmpeg (${ffmpeg}): ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(result.stderr.trim().split("\n").slice(-3).join("\n"));
    process.exit(result.status ?? 1);
  }
  return result.stderr;
}

function ssim(a, b) {
  const match = run(["-i", a, "-i", b, "-lavfi", "ssim", "-f", "null", "-"]).match(/All:([0-9.]+)/);
  if (!match) throw new Error(`no SSIM reported for ${a} vs ${b}`);
  return Number(match[1]);
}

const dir = mkdtempSync(path.join(tmpdir(), "loop-seam-"));
try {
  // Frames n and n+1 for every n that is a multiple of `every`: (0,1), (5,6), ...
  run([
    "-v", "error", "-y", "-i", input,
    "-vf", `select=lt(mod(n\\,${every})\\,2)`, "-fps_mode", "passthrough",
    path.join(dir, "p%04d.png"),
  ]);
  const last = path.join(dir, "last.png");
  run(["-v", "error", "-y", "-sseof", "-0.5", "-i", input, "-update", "1", last]);

  const pairs = readdirSync(dir).filter((f) => f.startsWith("p")).sort();
  const steps = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    steps.push(ssim(path.join(dir, pairs[i]), path.join(dir, pairs[i + 1])));
  }
  if (steps.length === 0) throw new Error("clip too short to sample");

  const first = path.join(dir, pairs[0]);
  const change = (s) => Math.max(1e-6, 1 - s);
  const seam = change(ssim(last, first));
  const changes = steps.map(change).sort((a, b) => a - b);
  const biggest = changes[changes.length - 1];
  const typical = changes[Math.floor(changes.length / 2)];
  const ok = seam <= biggest * ratio;

  console.log(`normal one-frame steps  ${steps.length} sampled, typical change ${typical.toFixed(4)}, biggest ${biggest.toFixed(4)}`);
  console.log(`loop seam (last -> 0)   change ${seam.toFixed(4)}  (${(seam / biggest).toFixed(2)}x the biggest step)`);
  console.log(
    ok
      ? "seamless: the seam looks like a normal frame step"
      : "JUMP: the seam is a bigger change than any normal frame step",
  );
  process.exitCode = ok ? 0 : 2;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
