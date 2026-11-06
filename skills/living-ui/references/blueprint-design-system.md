# Blueprint design system

The example site uses a "blueprint" language: an engineer's drawing at night. It suits motion-heavy pages because the motion has somewhere to come from. Cursors draw frames on a grid that is already there, and dimension lines and crosshairs make the build look like work being done, not decoration.

Use it as is (`assets/blueprint.css`, `assets/decor.tsx`, `assets/parallax.tsx`) or as a model for your own language. The method at the end matters more than the colors.

## Tokens

Everything is scoped to `.bp-root`, so the rest of an app keeps its own styles.

| Token | Value | Use |
| --- | --- | --- |
| `--bp-bg` | `#07090d` | page ground (also `html`/`body` background, so overscroll matches) |
| `--bp-panel` | `#0c1017` | cards, terminal, video frames |
| `--bp-line` | `#1c2431` | 1 px borders, section rules |
| `--bp-line-strong` | `#2a3546` | hover borders, chips, buttons |
| `--bp-text` | `#e8edf4` | body and headings |
| `--bp-muted` | `#8a97a8` | secondary copy |
| `--bp-dim` | `#5b6676` | labels, readouts (use `#747e8b` or lighter in video, where contrast checks are stricter) |
| `--bp-accent` | `#5eead4` | the one accent: primary button, focus ring, live dots |
| `--bp-guide` | `#fbbf24` | guides and measurement marks |
| roles | violet `#a78bfa`, green `#34d399`, pink `#f472b6`, blue `#60a5fa`, amber `#fbbf24`, orange `#fb923c`, lime `#a3e635` | agent roles; also metric colors and video packets |

There is one accent plus a role palette, and the roles color only things that belong to an agent. When everything is colored, nothing reads as alive.

## The grid

A fixed `::before` layer on `.bp-root` draws a 96 px grid with a 24 px subgrid, plus a faint accent glow at the top. Its mask fades it toward the edges. The theme bridges its tokens into the `--swarm-*`, `--lv-*` and `--fx-*` variables of the three motion skills, so one palette drives everything.

It is `position: fixed`, so the browser composites it once and never repaints it on scroll, which is why the grid costs nothing. Page content (`main`, `footer`) sits at `z-index: 1` above it. The grid spotlight in `living-ui-effects` reproduces the same lattice exactly, so its lines land on these lines.

## Type

- **Headlines:** Geist (via `next/font/local` or the `geist` package), weight 600–620, tracking -0.03 to -0.04em. `h1` uses `clamp(2.6rem, 7.2vw, 5.75rem)` with line-height 0.98.
- **Accent words:** Instrument Serif italic (`next/font/google`, `style: ["italic"]`), at most one or two words per heading ("Selected *builds*"). The build engine first types headings in a mono draft and then swaps to the real font. That swap only reads if the real font is clearly different, which is why the serif is there.
- **Labels, numbers, logs:** Geist Mono. Use tabular numbers for anything that counts.
- Load only the faces you use, and set `preload: false` on faces used below the fold.

## Surfaces

- **Cards** (`.bp-card`): panel color, 1 px line, 14 px radius, no shadow. Hover lifts by 2 px and strengthens the border. For hologram tilt from `living-ui-effects`, add `data-holo` to a card (or pass `holo={{ selector: ".bp-card" }}` to `FxRoot`).
- **Chips** (`.bp-chip`): mono, pill, muted. Use them for stacks and tags.
- **Buttons** (`.bp-btn`, `.bp-btn-primary`): 2.6 rem tall, 10 px radius. The primary is the only filled accent element on the page.
- **Terminal** (`.bp-terminal`): mono at 0.8 rem with a 1.75 line-height, so a live log can scroll without shifting layout. A live log inside it uses living-ui-swarm's `.swarm-log`, which fixes the height so new lines never shift layout.

## Decoration (decor.tsx)

All of these are `aria-hidden`, `pointer-events: none`, hidden below `md`, and moved by `<Parallax />`:

- `SectionNumeral`: a huge outline number ("02") behind each section header.
- `CrossMark`: a crosshair with a coordinate readout ("x 1180 · y 3020").
- `DimLine`: a dimension line with end ticks and a measure ("1120 · grid 12").
- `Bracket`: a corner bracket, like a fragment of a selection frame.
- `WordBand`: two rows of huge outline words drifting in opposite directions on scroll.
- `HeroSchematic`: a faint agent-mesh drawing behind the hero. Its nodes carry `data-swarm-spawn="<role>"`, so the swarm engine spawns agents from them and lights them up as it boots (the glow styles live in living-ui-swarm's `swarm.css`).

Parallax rule: only decoration and image contents move. Build items never move, because the swarm engine measures them and a moving target makes the cursors miss.

## Making your own language

The blueprint is one answer. To find another:

1. Pick a real-world metaphor where your motion makes sense: a drafting table, a mission-control console, a print shop, a film editing bay.
2. Write down its materials (ground, ink, rules, labels) and turn them into 8–12 tokens.
3. Pick a type trio: a workhorse, an accent with strong contrast, and a mono or data face.
4. List 4–6 small artifacts of that world (crosshairs, registration marks, timecodes, crop marks) and build them as `aria-hidden` decor.
5. Decide which elements may move, and keep everything the engine measures still.
6. Check contrast: muted text at least 4.5:1 on the ground for body copy. Decoration can be fainter because it isn't content.
