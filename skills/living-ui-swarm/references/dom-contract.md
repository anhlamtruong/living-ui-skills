# DOM contract

Everything the engine reads from, or writes to, the page. Authors only add
attributes to server-rendered markup; the engine never creates or removes
page content (apart from the live log lines and an out-of-flow layer for
font-swap drafts).

Contents
1. Sections
2. Items and kinds
3. Item options
4. Lists and dup
5. Grids
6. Optional hooks: mesh, live log, finale
7. What the engine writes
8. URL switches and session memory
9. CSS the engine relies on
10. Phone, tablet and desktop differences

## 1. Sections

| Attribute | Value | Default | Effect |
| --- | --- | --- | --- |
| `data-build-section` | a short name | `"section"` | Marks a build unit. The name shows in the plan tag and the log ("approved hero"). Items belong to their nearest section ancestor. |
| `data-build-start` | `load` | on scroll | Build right after the engine boots, using the larger hero budget. Use it on the first section only. |
| `data-build-plan` | text | `plan · N tasks` | Overrides the planner's tag text. |
| `data-build-finale` | (flag) | off | Runs the deploy finale after this section is approved (see 6). |
| `data-build-grid` | (flag) | off | The section element itself is a grid (see 5). |

A section starts when its top passes 78% of the viewport height
(`ScrollTrigger` `start: "top 78%"`). Sections already above the viewport on
load are finished instantly. Sections in view at boot start immediately.

Items outside any section are never hidden: they get `[data-built]` at
start.

Size sections to about one viewport of items. The budget per section is
fixed (3.85 s desktop, 2.2 s phone), so a section with 80 items will need the
catch-up speed and look rushed.

## 2. Items and kinds

`data-build-item` marks an item. `data-build="<kind>"` picks the
choreography. An unknown or missing kind means `frame`.

| Kind | Use for | What happens |
| --- | --- | --- |
| `frame` | cards, panels, buttons, any container | Outline dragged corner to corner, then the element fades in. With `data-build-tune`, an inspector panel opens and its radius and padding knobs are dragged to the real values. |
| `type` | short text: headings, labels, one-liners | A caret types it behind a `clip-path` (no DOM or layout change). Text over ~120 characters falls back to `reveal`. |
| `reveal` | paragraphs, bullet lists, long text | Unmasked line by line. |
| `image` | images, avatars, logos, video wrappers | A ghost card is dragged in from the nearest viewport edge and dropped on the slot. Uses the inner `<img>`, or a `<video poster>`, as the thumbnail; otherwise a hatched placeholder with the alt or aria-label text. A kept image gets an outline and scan instead of a drag. |
| `dup` | 2nd..nth item of a `data-build-list` | Ghost copies fly from the list's master to each slot (see 4). |

Nesting: an item inside another item waits until its parent is visible.
That is how a card (frame) gets its title (type), body (reveal) and chips
(list) in the right order.

Default order inside a section: rows top to bottom (24 px bands), then left
to right. `data-build-order` overrides it.

## 3. Item options

| Attribute | On | Values | Effect |
| --- | --- | --- | --- |
| `data-build-font` | `type` | flag | Types in a mono draft (an aria-hidden clone in the overlay layer). A font menu opens, the real family is picked, and the draft cross-fades into the real text. A child in another family (e.g. a serif `<span>`) gets its own menu row. |
| `data-build-weight` | `type` with `-font` | flag | After the swap, font-weight sweeps from 250 to the computed weight. |
| `data-build-scale` | `type` or `reveal` | flag | Appears at 42% size, offset, gets resized with a corner handle and moved into place with an arrow readout. The inline transform is removed at the end. Desktop and tablet only. Ignored on kept items. |
| `data-build-color` | any item | `text`, `fill`, `stroke` | The item first appears in a neutral color (`--swarm-neutral-text|fill|stroke`). After it appears, a color wheel picks its real computed color, `color`, `background-color` or `border-color`. Skipped if the target is transparent or there is no border. |
| `data-build-tune` | `frame` | flag | Always open the inspector panel. Without it, every 2nd (desktop) or 3rd (tablet) leaf card gets one automatically; never on phones. |
| `data-build-from` | `image` | `left`, `right`, `top`, `bottom` | Edge to drag from. Default: nearest edge. |
| `data-build-keep` | any item | flag, or `mobile` | Never hidden, still annotated by the crew. `="mobile"` keeps it only below 768 px. Kept items never font-swap or scale. |
| `data-build-label` | any item | text | Tag and log name ("framed run.log", "dragged clip.mp4"). Default comes from class words (card, chip, btn, badge, panel, terminal, logo, tile) or the tag name. |
| `data-build-order` | any item | number | Sort key inside the section (default = visual rank). `-1` puts it first. |
| `data-build-role` | any item | `planner`, `coder`, `designer`, `reviewer`, `tester`, `deployer` | Strongly prefer that role for the task. |

Use `data-build-keep="mobile"` on the hero heading. On phones it is the
Largest Contentful Paint element, and hiding it until the build reaches it
hurts LCP. Desktop still gets the full build.

React-managed text that changes after hydration (a fetched view count, a
clock) should be a `frame`. The `type` task measures glyph boxes once and
types against them.

## 4. Lists and dup

```html
<ul data-build-list>
  <li data-build-item data-build="frame">master</li>
  <li data-build-item data-build="dup">copy</li>
  <li data-build-item data-build="dup">copy</li>
</ul>
```

- The list's first `data-build-item` child is the master. Mark it `frame`.
- `dup` siblings are batched. On desktop one agent duplicates 2 to 8 slots in
  one sweep (one per task when the list has 3 or fewer). On phones the
  whole list is a single sweep, of up to 24 slots.
- Items nested inside a dup slot are built together with that slot.
- Lists of 6 or more containing images: a few tiles (3 desktop, 2 tablet, 1
  phone) are dragged in individually as images, so a logo wall gets some
  drags among the copies. You can also choose which ones by marking them
  `image` with `data-build-from`.
- On phones a plain master (no nested items) joins the sweep as its first
  slot: one task fewer per list.
- A `dup` with no list or no master becomes a `frame`.

## 5. Grids

`data-build-grid` goes on the section element itself, or on a container
inside it. The container may also be the `data-build-list`.

- A layout agent (lime) measures the direct element children (the cells).
  It draws dashed column and row lines from their rects, then sweeps a
  hatched placeholder box over each cell, row by row.
- The outermost items inside the grid wait for the lines. Each cell's
  placeholder fades once the items in that cell are built.
- The grid container itself is never hidden and never marked built.
- Layout agents prefer grids, then card frames. Other roles leave grids
  alone while a layout agent is free.
- A grid outside any section is ignored.

## 6. Optional hooks: mesh, live log, finale

### Mesh spawn nodes

```html
<svg viewBox="0 0 620 620" aria-hidden="true">
  <g data-swarm-spawn="planner" style="color:#a78bfa">
    <circle class="swarm-node-halo" cx="310" cy="310" r="40" stroke="currentColor" />
    <circle cx="310" cy="310" r="7" stroke="currentColor" />
  </g>
  <g data-swarm-spawn="coder" style="color:#34d399">...</g>
</svg>
```

- At boot (and on Replay) on desktop ≥1024 px, the nodes get `[data-lit]` one
  by one, and each agent pops out of a node of its role.
- `[data-lit]` is removed when the hero section finishes.
- Hidden or zero-size nodes are ignored; with no visible node the crew
  enters from the edges.
- Roles: `planner`, `coder`, `designer`, `layout`, `tester`, `reviewer`,
  `deployer`.
- Styles for `[data-lit]` and `.swarm-node-halo` are in `swarm.css`.

### Live log

```html
<div data-swarm-log data-swarm-log-lines="6" class="swarm-log">
  <p class="swarm-log__line"><span class="swarm-log__who">planner</span><span class="swarm-log__what">split page into 7 sections</span></p>
  <!-- more fallback lines -->
</div>
```

- Server-render real fallback lines. The engine sets them aside, streams live
  lines while building, and restores them on Skip or unmount.
- Live line markup is `p.swarm-log__line > span.swarm-log__who`, `__what`,
  `__t`. The `who` span is colored by role.
- Writes are batched (at most one per 100 ms) and capped to the newest N
  lines.
- The container gets `aria-hidden="true"` and `contain: inline-size` while
  live, so a long line can never widen a grid track and reflow the page.
  Give it a fixed height (`.swarm-log` does 6 × 1.75em).
- There's only one log per page (the first `[data-swarm-log]`). Lines from
  sections other than the one containing the log get a `name · ` prefix.

### Deploy finale

```html
<section data-build-section="contact" data-build-finale>
  ...
  <a data-build-item data-build="frame" data-deploy-target data-deploy-text="live at example.com" href="mailto:...">Email me</a>
</section>
```

- After the section's approval, the deployer (or any free worker) clicks the
  target. A small panel runs build → upload → edge.
- Then the target gets `[data-deployed]` (a pulse in `swarm.css`) and the log
  says `deployed → <data-deploy-text>`.
- Skip and instant finishes jump straight to `[data-deployed]`.

## 7. What the engine writes

| Where | What | When |
| --- | --- | --- |
| `<html>` | `data-build="on"` | Set by the head script before paint. Removed by the failsafe, by `?build=off`, or on a real unmount. |
| items and sections | `data-built` | When finished (also on Skip, instant finishes, and orphans at start). Gate other effects on it. |
| items | inline `opacity`, `clip-path`, `filter`, neutral color, `transform` (scale task) | Only while building; removed afterwards. A color task restores the author's own inline value. |
| mesh nodes | `data-lit` | Boot and Replay, removed when the hero finishes. |
| finale target | `data-deployed` | After the finale. |
| log container | children, `aria-hidden`, `contain` | While live; restored afterwards. |
| `document.body` level | `div.swarm-layer` (font drafts), `canvas.swarm-canvas`, `div.swarm-hud` | Rendered by `BuildLayer`. |

## 8. URL switches and session memory

- `?build=off`: the head script never sets the flag, and the engine doesn't
  start. Everything shows from first paint.
- `?build=force`: plays the build even if this tab already watched it.
- After every section in the page has been built, `sessionStorage`
  `swarm-built-v1 = "all"`. The next load in the same tab skips the build.
  Replay clears the key.
- Failsafe: if the engine hasn't started 3 s after `load` (or 8 s after the
  head script ran), the flag is removed and all content shows.

## 9. CSS the engine relies on

From `swarm.css`:

```css
html[data-build="on"] [data-build-item]:not([data-built]):not([data-build-keep]) { opacity: 0; }
@media (min-width: 768px) {
  html[data-build="on"] [data-build-item][data-build-keep="mobile"]:not([data-built]) { opacity: 0; }
}
```

- The 768 px breakpoint must match `WIDE_QUERY` in `palette.ts`.
- `canvas.swarm-canvas` is fixed, full-viewport, `pointer-events: none`,
  `z-index: var(--swarm-z, 55)`. Raise it above sticky headers if cursors
  disappear behind them.
- A print rule always shows content.

## 10. Phone, tablet and desktop differences

| | Phone (<768 px) | Tablet (768–1023) | Desktop (≥1024) |
| --- | --- | --- | --- |
| Crew | 8, no deployer | 11 | 15 |
| Section budget (hero) | 2.2 s (2.2 s) | 3.4 s (4.6 s) | 3.85 s (5.25 s) |
| Font swap | first `data-build-font` item only | all | all |
| Typing | lines over 12 chars are revealed instead | full | full |
| Scale task | off | on | on |
| Inspector panels | off | on, auto every 3rd card | on, auto every 2nd card |
| Color picks per section | 1 | 2 | unlimited |
| Logo drags per big list | 1 | 2 | 3 |
| Dup batching | one sweep per list | 2–8 per sweep | 2–8 per sweep |
| Handoff packets between agents | off | on | on |
| Mesh boot, inspect mode | off | off (both need a viewport ≥1024 px; inspect also needs a fine pointer) | on |
