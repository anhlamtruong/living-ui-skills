// Part of living-ui-skills (MIT). Adapt freely.
// https://github.com/anhlamtruong/living-ui-skills
// Agent motion: arrive + separation steering on typed arrays (document px).
// An agent with follow > 0 is "gripping" something (a frame corner, a caret)
// and tracks its target with exponential smoothing instead of steering.

const GAIN = 9; // how fast velocity converges on the desired velocity (1/s), at accel 1
const MAX_ACC = 16000; // px/s^2, at accel 1
const SEP = 30; // personal space radius, px
const SEP_K = 260; // separation strength, (px/s^2) per px of overlap

export class Sim {
  readonly n: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly tx: Float32Array;
  readonly ty: Float32Array;
  readonly speed: Float32Array;
  readonly follow: Float32Array;
  /** 1 while the agent is in the world (simulated + drawn). */
  readonly on: Uint8Array;
  /** Render hints: bit 1 = carrying a duplicate. */
  readonly flag: Uint8Array;
  /** Cursor glyph per agent (TOOL.*). */
  readonly tool: Uint8Array;
  /** Spawn pop 0..1 (cursor scales in); 1 when settled. */
  readonly pop: Float32Array;
  /** Cursor rotation (rad) while looping idle; eased back to 0 otherwise. */
  readonly spin: Float32Array;

  private readonly gain: number;
  private readonly maxAcc: number;

  constructor(n: number, accel = 1) {
    this.n = n;
    this.gain = GAIN * accel;
    this.maxAcc = MAX_ACC * accel;
    const f = () => new Float32Array(n);
    this.x = f();
    this.y = f();
    this.vx = f();
    this.vy = f();
    this.tx = f();
    this.ty = f();
    this.speed = f();
    this.follow = f();
    this.on = new Uint8Array(n);
    this.flag = new Uint8Array(n);
    this.tool = new Uint8Array(n);
    this.pop = new Float32Array(n).fill(1);
    this.spin = new Float32Array(n);
  }

  place(i: number, x: number, y: number): void {
    this.x[i] = this.tx[i] = x;
    this.y[i] = this.ty[i] = y;
    this.vx[i] = this.vy[i] = 0;
  }

  dist(i: number): number {
    return Math.hypot(this.tx[i] - this.x[i], this.ty[i] - this.y[i]);
  }

  step(dt: number): void {
    const { n, x, y, vx, vy, tx, ty, speed, follow, on } = this;
    for (let i = 0; i < n; i++) {
      if (!on[i]) continue;
      if (follow[i] > 0) {
        const k = 1 - Math.exp(-follow[i] * dt);
        const nx = x[i] + (tx[i] - x[i]) * k;
        const ny = y[i] + (ty[i] - y[i]) * k;
        vx[i] = (nx - x[i]) / dt;
        vy[i] = (ny - y[i]) / dt;
        x[i] = nx;
        y[i] = ny;
        continue;
      }
      const max = speed[i];
      const slow = Math.max(90, max * 0.12);
      const dx = tx[i] - x[i];
      const dy = ty[i] - y[i];
      const d = Math.hypot(dx, dy);
      const want = d > 0.5 ? (d < slow ? (max * d) / slow : max) / d : 0;
      let ax = (dx * want - vx[i]) * this.gain;
      let ay = (dy * want - vy[i]) * this.gain;
      for (let j = 0; j < n; j++) {
        if (j === i || !on[j]) continue;
        const sx = x[i] - x[j];
        const sy = y[i] - y[j];
        const q = sx * sx + sy * sy;
        if (q > SEP * SEP || q < 1e-4) continue;
        const s = Math.sqrt(q);
        const push = ((SEP - s) * SEP_K) / s;
        ax += sx * push;
        ay += sy * push;
      }
      const a = Math.hypot(ax, ay);
      if (a > this.maxAcc) {
        ax *= this.maxAcc / a;
        ay *= this.maxAcc / a;
      }
      vx[i] += ax * dt;
      vy[i] += ay * dt;
      const v = Math.hypot(vx[i], vy[i]);
      if (v > max * 1.2) {
        vx[i] *= (max * 1.2) / v;
        vy[i] *= (max * 1.2) / v;
      }
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
    }
  }
}
