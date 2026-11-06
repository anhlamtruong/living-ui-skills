// Part of living-ui-skills (MIT). Adapt freely.
// https://github.com/anhlamtruong/living-ui-skills
// Live build log: streams engine events into [data-swarm-log] as plain DOM
// lines, batched (at most one write per 100 ms) and capped to the newest N.
// The server-rendered fallback lines are set aside while live and put back
// on Skip or unmount. Requires static (server-rendered) markup in the
// container, since the engine swaps its children.

type Line = [who: string, color: string, what: string, t: string];

function span(cls: string, text: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
}

export class LiveLog {
  private readonly el: HTMLElement | null;
  private readonly max: number;
  private fallback: Node[] | null = null;
  private aria: string | null = null;
  private contain = "";
  private queue: Line[] = [];
  private timer = 0;
  live = false;

  constructor() {
    this.el = document.querySelector<HTMLElement>("[data-swarm-log]");
    this.max = Math.max(1, Number.parseInt(this.el?.dataset.swarmLogLines ?? "", 10) || 6);
  }

  /** Who owns the log (lines from other sections get a prefix). */
  inside(el: Element): boolean {
    return !!this.el && el.contains(this.el);
  }

  /** Sets the fallback lines aside and starts streaming. */
  start(): void {
    const el = this.el;
    if (!el || this.live) return;
    if (!this.fallback) {
      this.fallback = Array.from(el.childNodes);
      this.aria = el.getAttribute("aria-hidden");
      this.contain = el.style.getPropertyValue("contain");
    }
    el.replaceChildren();
    el.setAttribute("aria-hidden", "true");
    // Live lines must never widen the layout (a grid track sized by a long
    // line would reflow the hero and every section below it).
    el.style.setProperty("contain", "inline-size");
    this.live = true;
  }

  push(who: string, color: string, what: string, t: string): void {
    if (!this.live) return;
    this.queue.push([who, color, what.length > 56 ? what.slice(0, 55) + "…" : what, t]);
    if (this.queue.length > this.max) this.queue.splice(0, this.queue.length - this.max);
    if (!this.timer) this.timer = window.setTimeout(this.flush, 100);
  }

  private flush = (): void => {
    this.timer = 0;
    const el = this.el;
    if (!el || !this.live) return;
    const frag = document.createDocumentFragment();
    for (const [who, color, what, t] of this.queue) {
      const p = document.createElement("p");
      p.className = "swarm-log__line";
      const w = span("swarm-log__who", who);
      w.style.color = color;
      p.append(w, span("swarm-log__what", what), span("swarm-log__t", t));
      frag.append(p);
    }
    this.queue = [];
    el.append(frag);
    while (el.childElementCount > this.max) el.firstElementChild?.remove();
  };

  /** Puts the server-rendered fallback lines back. */
  restore(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.queue = [];
    const el = this.el;
    if (!el || !this.live) return;
    el.replaceChildren(...(this.fallback ?? []));
    if (this.aria === null) el.removeAttribute("aria-hidden");
    else el.setAttribute("aria-hidden", this.aria);
    if (this.contain) el.style.setProperty("contain", this.contain);
    else el.style.removeProperty("contain");
    if (el.getAttribute("style") === "") el.removeAttribute("style");
    this.live = false;
  }
}
