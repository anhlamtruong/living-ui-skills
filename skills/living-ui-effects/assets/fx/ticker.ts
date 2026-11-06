// Part of living-ui-skills (MIT). Adapt freely.
// One requestAnimationFrame loop shared by every effect.
//
// The loop only runs while some effect asks for frames, so an idle page
// schedules nothing. A frame callback gets (now in ms, dt in s) and returns
// true to keep receiving frames, false to go back to sleep. dt is clamped so a
// background tab or a long task never makes springs or lerps jump.

export type FrameFn = (now: number, dt: number) => boolean;

const subs = new Set<FrameFn>();
let raf = 0;
let last = 0;

function frame(now: number): void {
  raf = 0;
  const dt = last ? Math.min(Math.max((now - last) / 1000, 0), 1 / 20) : 1 / 60;
  last = now;
  subs.forEach((fn) => {
    let keep = false;
    try {
      keep = fn(now, dt);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.error("[fx]", err);
    }
    if (!keep) subs.delete(fn);
  });
  if (subs.size) raf = requestAnimationFrame(frame);
  else last = 0;
}

/** Asks for frames until `fn` returns false. Calling it again is a no-op. */
export function wake(fn: FrameFn): void {
  subs.add(fn);
  if (!raf) raf = requestAnimationFrame(frame);
}

/** Stops sending frames to `fn`. */
export function sleep(fn: FrameFn): void {
  subs.delete(fn);
  if (!subs.size && raf) {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }
}

/** Frame-rate independent lerp factor for a rate in 1/s. */
export const ease = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
