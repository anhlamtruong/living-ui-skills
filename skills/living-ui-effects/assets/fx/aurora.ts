// Part of living-ui-skills (MIT). Adapt freely.
// Hero background: a slow, domain-warped value-noise field drawn as soft
// "liquid light" (WebGL1, one full-screen triangle). The pointer lenses the
// flow locally and drops soft ripples. Output is premultiplied alpha, so the
// page (and any fixed grid behind it) shows through.
//
// Cost control: reduced resolution with a pixel budget, DPR capped at 1.5,
// draws only while the canvas is on screen, the tab is visible and its section
// is built; a frame cap for high-refresh screens; quality steps down once if
// the page cannot hold ~38 fps. See references/aurora-shader.md.

import { FINE_POINTER, buildActive } from "./built";
import { ease, sleep, wake } from "./ticker";

/** Colors as #rrggbb. veil tints the haze, primary/secondary are the light, accent the hot strands. */
export type AuroraPalette = {
  veil: string;
  primary: string;
  secondary: string;
  accent: string;
};

export const DEFAULT_PALETTE: AuroraPalette = {
  veil: "#050c19",
  primary: "#60a5fa",
  secondary: "#a78bfa",
  accent: "#5eead4",
};

export type AuroraOptions = {
  palette?: Partial<AuroraPalette>;
  /** Multiplies the light (not the veil). 1 = the tuned default; 0.6 is calmer, 1.4 louder. */
  intensity?: number;
};

/** "#5eead4" -> "vec3(0.369, 0.918, 0.831)"; bad input falls back to the default color. */
function vec3(hex: string, fallback: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()) ?? /^#?([0-9a-f]{6})$/i.exec(fallback);
  const n = Number.parseInt(m ? m[1] : "000000", 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3));
  return `vec3(${c.join(", ")})`;
}

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = (precision: string, pal: AuroraPalette, intensity: number) => `
precision ${precision} float;

uniform vec2 u_res;
uniform vec2 u_o1;
uniform vec2 u_o2;
uniform vec2 u_o3;
uniform vec3 u_lens;   // center (height-normalized space), strength
uniform vec4 u_ripple; // center, radius, amplitude
uniform float u_seed;  // changes every frame (dither)

float hash(vec2 p) {
  vec3 q = fract(p.xyx * vec3(0.1371, 0.1197, 0.1543));
  q += dot(q, q.yzx + 31.73);
  return fract((q.x + q.y) * q.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

float fbm3(vec2 p) {
  float s = 0.5 * noise(p);
  p = ROT * p * 2.02 + vec2(7.3, 1.9);
  s += 0.25 * noise(p);
  p = ROT * p * 2.03 + vec2(3.1, 5.7);
  s += 0.125 * noise(p);
  return s / 0.875;
}

float fbm4(vec2 p) {
  float s = 0.5 * noise(p);
  p = ROT * p * 2.02 + vec2(7.3, 1.9);
  s += 0.25 * noise(p);
  p = ROT * p * 2.03 + vec2(3.1, 5.7);
  s += 0.125 * noise(p);
  p = ROT * p * 2.01 + vec2(1.7, 9.2);
  s += 0.0625 * noise(p);
  return s / 0.9375;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = vec2(uv.x * u_res.x / u_res.y, uv.y);

  // Pointer lens: magnify toward the center with a slight swirl.
  vec2 d = p - u_lens.xy;
  float lens = u_lens.z * exp(-dot(d, d) / 0.05);
  p -= d * lens * 0.42;
  float sw = lens * 0.8;
  float cs = cos(sw);
  float sn = sin(sw);
  p = u_lens.xy + mat2(cs, sn, -sn, cs) * (p - u_lens.xy);

  // Soft expanding ripple ring.
  vec2 rd = p - u_ripple.xy;
  float rl = length(rd) + 1e-4;
  float rk = (rl - u_ripple.z) * 10.0;
  p += (rd / rl) * exp(-rk * rk) * u_ripple.w * 0.03;

  vec2 n = p * 1.85;
  vec2 q = vec2(fbm3(n + u_o1), fbm3(n + vec2(5.2, 1.3) + u_o2));
  float f = fbm4(n + 2.3 * q + u_o3);

  // Broad glow plus thin strands along the warped field's contours.
  float glow = smoothstep(0.38, 0.92, f);
  float c = cos((f * 3.4 + q.x * 0.9) * 3.14159265);
  float strand = pow(abs(c), 22.0) * smoothstep(0.32, 0.72, f);

  vec3 veilC = ${vec3(pal.veil, DEFAULT_PALETTE.veil)};
  vec3 accent = ${vec3(pal.accent, DEFAULT_PALETTE.accent)};
  vec3 primary = ${vec3(pal.primary, DEFAULT_PALETTE.primary)};
  vec3 secondary = ${vec3(pal.secondary, DEFAULT_PALETTE.secondary)};
  vec3 hue = mix(primary, secondary, smoothstep(0.4, 0.72, q.y));
  hue = mix(hue, accent, smoothstep(0.52, 0.86, q.x * 0.55 + f * 0.6));

  vec3 light = (hue * (glow * glow * 0.2 + strand * 0.15) + accent * lens * 0.045) * ${intensity.toFixed(3)};

  // Fade into the page at every edge; keep the text column (lower left) calmer.
  float ex = smoothstep(0.0, 0.16, uv.x) * smoothstep(1.0, 0.86, uv.x);
  float ey = smoothstep(0.0, 0.24, uv.y) * smoothstep(1.0, 0.82, uv.y);
  float mask = ex * ey;
  float bias = mix(0.5, 1.0, smoothstep(0.2, 0.95, uv.x * 0.7 + uv.y * 0.45));
  light *= mask * bias;

  float veil = 0.2 * mask;
  vec3 rgb = veilC * veil + light;
  float a = max(veil, max(rgb.r, max(rgb.g, rgb.b)));
  rgb += (hash(gl_FragCoord.xy + u_seed) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(rgb, 0.0, a), a);
}
`;

type Gl = {
  gl: WebGLRenderingContext;
  prog: WebGLProgram;
  buf: WebGLBuffer;
  u: Record<string, WebGLUniformLocation | null>;
};

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function build(gl: WebGLRenderingContext, frag: (precision: string) => string): Gl | null {
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  const precision = hp && hp.precision > 0 ? "highp" : "mediump";
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag(precision));
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  const buf = gl.createBuffer();
  if (!buf) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.useProgram(prog);
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  const u: Gl["u"] = {};
  for (const name of ["u_res", "u_o1", "u_o2", "u_o3", "u_lens", "u_ripple", "u_seed"]) {
    u[name] = gl.getUniformLocation(prog, name);
  }
  return { gl, prog, buf, u };
}

export type Aurora = {
  destroy(): void;
};

/**
 * Starts the shader on `canvas`. `scope` is the section it lives in (its
 * [data-built] gates the start when a build animation runs). Returns null
 * when WebGL is unavailable or would run in a slow software fallback.
 */
export function createAurora(
  canvas: HTMLCanvasElement,
  scope: HTMLElement,
  options: AuroraOptions = {},
): Aurora | null {
  const pal: AuroraPalette = { ...DEFAULT_PALETTE, ...options.palette };
  const intensity = Math.max(0, options.intensity ?? 1);
  const frag = (precision: string) => FRAG(precision, pal, intensity);
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
      failIfMajorPerformanceCaveat: true,
    }) as WebGLRenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) return null;
  let g: Gl | null = build(gl, frag);
  if (!g) return null;

  const coarse = !window.matchMedia(FINE_POINTER).matches;
  const budget = coarse ? 170_000 : 380_000;
  let quality = 1; // steps down once if frames run long
  let cssW = 0;
  let cssH = 0;
  let sizeDirty = true;

  // State (time-based).
  let t = 37; // start mid-flow
  let visible = false;
  let ready = false;
  let running = false;
  let lost = false;
  // Lens (height-normalized coordinates, y up).
  let lx = 0.9;
  let ly = 0.6;
  let ls = 0;
  // Pointer, in client px.
  let px = 0;
  let py = 0;
  let pointerType = "";
  let inside = false;
  let touchUntil = 0;
  let lastMoveAt = 0;
  let lastRippleAt = -1e9;
  let speed = 0;
  // Ripple.
  let rx = 0;
  let ry = 0;
  let rAge = 99;
  // Frame pacing (for the one-time quality step).
  let paceN = 0;
  let paceSum = 0;
  let lastDraw = 0;

  /** Sizes the drawing buffer; returns true when it changed (and was cleared). */
  const resize = (): boolean => {
    const rect = canvas.getBoundingClientRect();
    cssW = rect.width;
    cssH = rect.height;
    if (cssW < 2 || cssH < 2) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const scale = Math.min(0.5 * dpr, Math.sqrt(budget / (cssW * cssH))) * quality;
    const w = Math.max(1, Math.round(cssW * scale));
    const h = Math.max(1, Math.round(cssH * scale));
    sizeDirty = false;
    if (canvas.width === w && canvas.height === h) return false;
    canvas.width = w;
    canvas.height = h;
    return true;
  };

  const ripple = (cx: number, cy: number, now: number) => {
    rx = cx;
    ry = cy;
    rAge = 0;
    lastRippleAt = now;
  };

  /** Client px -> shader space; null when outside the canvas. */
  const toShader = (x: number, y: number, rect: DOMRect): [number, number, boolean] => {
    const u = (x - rect.left) / rect.width;
    const v = 1 - (y - rect.top) / rect.height;
    return [u * (rect.width / rect.height), v, u >= 0 && u <= 1 && v >= 0 && v <= 1];
  };

  const frame = (now: number, dt: number): boolean => {
    if (!running || lost || !g) return false;
    const cleared = sizeDirty && resize();
    if (canvas.width < 2 || canvas.height < 2) return true;
    const glx = g.gl;
    t += dt;

    // Lens target: pointer when a mouse is over the hero or a recent tap,
    // otherwise a slow drift so the flow keeps breathing on its own.
    const rect = canvas.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    let tx = aspect * (0.62 + 0.24 * Math.sin(t * 0.11));
    let ty = 0.58 + 0.2 * Math.sin(t * 0.083 + 1.1);
    let ts = 0.28;
    if (pointerType) {
      const [sx, sy, ins] = toShader(px, py, rect);
      const mouseIn = pointerType !== "touch" && ins;
      if (mouseIn && !inside) ripple(sx, sy, now);
      inside = mouseIn;
      if (mouseIn || now < touchUntil) {
        tx = sx;
        ty = sy;
        ts = 1;
      }
      if (mouseIn && speed > 1400 && now - lastRippleAt > 1500) ripple(sx, sy, now);
    }
    speed *= Math.exp(-dt * 6);
    lx += (tx - lx) * ease(dt, 4.5);
    ly += (ty - ly) * ease(dt, 4.5);
    ls += (ts - ls) * ease(dt, ts > ls ? 2.4 : 1.2);
    rAge += dt;
    const rAmp = rAge < 4 ? Math.exp(-rAge * 1.3) * Math.min(1, rAge * 8) : 0;

    // High-refresh screens: the state above stays time-based every frame, but
    // the GPU draws at most ~60-80 times a second.
    if (!cleared && now - lastDraw < 12) return true;
    lastDraw = now;

    // Bounded offsets (computed here in double precision) animate the warp.
    glx.viewport(0, 0, canvas.width, canvas.height);
    glx.uniform2f(g.u.u_res, canvas.width, canvas.height);
    glx.uniform2f(g.u.u_o1, Math.cos(t * 0.021) * 2.3, Math.sin(t * 0.019) * 2.3);
    glx.uniform2f(g.u.u_o2, Math.sin(t * 0.016 + 1.3) * 2.9, Math.cos(t * 0.02 + 0.4) * 2.9);
    glx.uniform2f(g.u.u_o3, Math.cos(t * 0.012 + 2.1) * 3.3, Math.sin(t * 0.015 + 0.7) * 3.3);
    glx.uniform3f(g.u.u_lens, lx, ly, ls);
    glx.uniform4f(g.u.u_ripple, rx, ry, rAge * 0.42, rAmp);
    glx.uniform1f(g.u.u_seed, (now % 1000) * 0.37);
    glx.drawArrays(glx.TRIANGLES, 0, 3);

    // One quality step if the page cannot hold ~40 fps with the shader on.
    if (quality === 1) {
      paceN++;
      paceSum += dt;
      if (paceN >= 150) {
        if (paceSum / paceN > 1 / 38) {
          quality = 0.72;
          sizeDirty = true;
        }
        paceN = 0;
        paceSum = 0;
      }
    }
    return true;
  };

  const update = () => {
    const should = ready && visible && !lost && !document.hidden && !!g;
    if (should === running) return;
    running = should;
    if (running) {
      paceN = 0;
      paceSum = 0;
      wake(frame);
    } else sleep(frame);
  };

  const readReady = () => {
    const next = !buildActive() || scope.hasAttribute("data-built");
    if (next === ready) return;
    ready = next;
    if (ready) canvas.setAttribute("data-on", "");
    else canvas.removeAttribute("data-on");
    update();
  };

  const onMove = (e: PointerEvent) => {
    const now = performance.now();
    if (pointerType && e.pointerType !== "touch" && lastMoveAt) {
      const dtm = Math.max(8, now - lastMoveAt);
      speed = Math.max(speed, (Math.hypot(e.clientX - px, e.clientY - py) / dtm) * 1000);
    }
    lastMoveAt = now;
    px = e.clientX;
    py = e.clientY;
    pointerType = e.pointerType || "mouse";
  };
  const onDown = (e: PointerEvent) => {
    onMove(e);
    const rect = canvas.getBoundingClientRect();
    const [sx, sy, ins] = toShader(e.clientX, e.clientY, rect);
    if (!ins) return;
    if (e.pointerType === "touch") touchUntil = performance.now() + 1600;
    ripple(sx, sy, performance.now());
  };
  const onLeave = (e: PointerEvent) => {
    if (!e.relatedTarget) pointerType = "";
  };
  const onVisibility = () => update();
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    g = null;
    update();
  };
  const onRestored = () => {
    lost = false;
    g = gl ? build(gl, frag) : null;
    sizeDirty = true;
    update();
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) visible = e.isIntersecting;
      update();
    },
    { rootMargin: "80px 0px" },
  );
  io.observe(canvas);
  const ro = new ResizeObserver(() => {
    sizeDirty = true;
  });
  ro.observe(canvas);
  const mo = new MutationObserver(readReady);
  mo.observe(scope, { attributes: true, attributeFilter: ["data-built"] });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-build"] });

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  document.addEventListener("pointerout", onLeave, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  readReady();
  update();

  return {
    destroy() {
      running = false;
      sleep(frame);
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerout", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      canvas.removeAttribute("data-on");
      // Free GPU objects but keep the context: under StrictMode the same
      // canvas is set up again right away, and a lost context would stay lost.
      if (g && !lost) {
        g.gl.deleteBuffer(g.buf);
        g.gl.deleteProgram(g.prog);
      }
      g = null;
    },
  };
}
