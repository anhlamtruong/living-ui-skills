# Markup recipes

Copy-paste starting points. They are JSX for React / Next.js, and they work
the same as plain HTML attributes. Class names are placeholders; only the
`data-*` attributes matter to the engine.

Every one of these is used on https://www.lamanhtruong.com. The pinned
sources are under
`https://github.com/anhlamtruong/portfolio-anh/blob/a5d165123922ea5c7fd645c4d0701554b1e4df8f/src/app/(homepage)/_sections/`
(`hero.tsx`, `projects.tsx`, `skills.tsx`, `experience.tsx`, `contact.tsx`).

Contents
1. Hero with font swap, avatar drag, buttons, live log
2. Section header as its own small section
3. Card grid, one section per card
4. Chip list with dup
5. Logo wall: grid + dup + a few drags
6. Image or video drag
7. Metrics strip with color and scale
8. Timeline: one section per entry
9. Finale

## 1. Hero

```tsx
<section data-build-section="hero" data-build-start="load" className="hero">
  {/* Optional: mesh nodes the crew pops out of (desktop >= 1024 px). */}
  <AgentMesh />

  <p data-build-item data-build="type" className="eyebrow">shipping things at Example Co</p>

  {/* Typed first in a mono draft, swapped to the real fonts, weight sweep.
      Kept on phones so it is visible at first paint (LCP). */}
  <h1
    data-build-item
    data-build="type"
    data-build-font
    data-build-weight
    data-build-keep="mobile"
    data-build-order="-1"
    data-build-role="coder"
    data-build-label="h1.name"
  >
    First <span className="serif">(Middle)</span> Last
  </h1>

  <p data-build-item data-build="type" data-build-font>Role · Company</p>
  <p data-build-item data-build="reveal">A two or three sentence summary that is too long to type.</p>

  <div data-build-list className="buttons">
    <a data-build-item data-build="frame" href="https://github.com/you">GitHub</a>
    <a data-build-item data-build="dup" href="https://linkedin.com/in/you">LinkedIn</a>
    <a data-build-item data-build="dup" data-build-color="fill" href="/resume.pdf" className="primary">Resume</a>
  </div>

  <div data-build-item data-build="image" data-build-from="right" className="avatar">
    <img src="/me.jpg" alt="Portrait of First Last" />
  </div>

  {/* A terminal card with a live log. The fallback lines are real content. */}
  <div data-build-item data-build="frame" data-build-tune data-build-label="run.log" className="card terminal">
    <p data-build-item data-build="type">$ build page --agents 15</p>
    <div data-swarm-log data-swarm-log-lines="6" className="swarm-log">
      <p className="swarm-log__line"><span className="swarm-log__who">planner</span><span className="swarm-log__what">split page into 7 sections</span></p>
      <p className="swarm-log__line"><span className="swarm-log__who">coder·03</span><span className="swarm-log__what">experience timeline</span></p>
      <p className="swarm-log__line"><span className="swarm-log__who">reviewer</span><span className="swarm-log__what">approved · 0 regressions</span></p>
    </div>
  </div>
</section>
```

Why it's built this way:
- **`data-build-order="-1"` and `data-build-role="coder"` on the h1:** the
  name gets typed first, by the first worker to arrive.
- **The terminal is a `frame`, its first line a nested `type`:** the line
  waits for the card.
- **`data-build-color="fill"` on the primary button:** it appears neutral,
  then a color wheel picks the accent. That draws the eye to the call to
  action.

A mesh for the hero (SVG; colors per role, halo shown when lit):

```tsx
const ROLE_COLOR = { planner: "#a78bfa", coder: "#34d399", designer: "#f472b6", layout: "#a3e635", tester: "#60a5fa", reviewer: "#fbbf24", deployer: "#fb923c" } as const;
const RING = ["coder", "designer", "layout", "tester", "reviewer", "coder", "deployer", "layout"] as const;

function AgentMesh() {
  return (
    <svg viewBox="0 0 620 620" aria-hidden="true" className="mesh hidden lg:block">
      {RING.map((role, i) => {
        const a = (i / RING.length) * Math.PI * 2 - Math.PI / 2;
        const x = 310 + Math.cos(a) * 220;
        const y = 310 + Math.sin(a) * 220;
        return (
          <g key={i} data-swarm-spawn={role} style={{ color: ROLE_COLOR[role] }}>
            <circle className="swarm-node-halo" cx={x} cy={y} r="16" fill="none" stroke="currentColor" strokeOpacity="0.5" />
            <circle cx={x} cy={y} r="7" fill="#07090d" stroke="currentColor" strokeOpacity="0.6" />
          </g>
        );
      })}
      <g data-swarm-spawn="planner" style={{ color: ROLE_COLOR.planner }}>
        <circle className="swarm-node-halo" cx="310" cy="310" r="52" fill="none" stroke="currentColor" strokeOpacity="0.4" />
        <rect x="270" y="296" width="80" height="28" rx="6" fill="#07090d" stroke="currentColor" strokeOpacity="0.55" />
      </g>
    </svg>
  );
}
```

The nodes are only the place agents appear from. The page itself is static,
and the agents never orbit the mesh.

## 2. Section header as its own small section

```tsx
<div data-build-section="projects-header">
  <p data-build-item data-build="type" className="eyebrow">02 — projects</p>
  <h2 data-build-item data-build="type" data-build-font data-build-scale>
    Selected <em className="serif">builds</em>
  </h2>
  <p data-build-item data-build="reveal">One line about what follows.</p>
</div>
```

A header is a small section of its own, so it builds the moment it scrolls
in, instead of waiting behind a big grid. `data-build-scale` makes the h2
start small, then get resized and moved into place.

## 3. Card grid, one section per card

```tsx
<div className="grid md:grid-cols-2">
  {projects.map((p, i) => (
    <div key={p.title} data-build-section={`project-${i + 1}`} className="flex">
      <article data-build-item data-build="frame" data-build-tune data-build-label="project" className="card">
        <div data-build-item data-build="image" data-build-from={i % 2 ? "right" : "left"} className="media">
          <img src={p.image} alt={`${p.title} screenshot`} />
        </div>
        <p data-build-item data-build="type" className="dates">{p.dates}</p>
        <h3 data-build-item data-build="type" data-build-font data-build-scale>{p.title}</h3>
        <p data-build-item data-build="type" data-build-color="text" className="accent">{p.tagline}</p>
        <p data-build-item data-build="reveal">{p.description}</p>
        <ul data-build-list className="chips">
          {p.stack.map((tech, j) => (
            <li key={tech} data-build-item data-build={j === 0 ? "frame" : "dup"} className="chip">{tech}</li>
          ))}
        </ul>
      </article>
    </div>
  ))}
</div>
```

One section per card keeps each build short. Two cards in view build side
by side, with their crews split between them.

## 4. Chip list with dup

```tsx
<ul data-build-list className="chips">
  {skills.map((s, i) => (
    <li key={s} data-build-item data-build={i === 0 ? "frame" : "dup"} className="chip">{s}</li>
  ))}
</ul>
```

The first chip is drawn as a frame, and the rest are flown in as copies in
batches. On phones the whole list is one sweep.

## 5. Logo wall: grid + dup + a few drags

```tsx
<div data-build-section="logos">
  <p data-build-item data-build="type" className="eyebrow">tools I use</p>
  <ul data-build-list data-build-grid className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8">
    {logos.map((l, i) => (
      <li
        key={l.name}
        data-build-item
        data-build={i === 0 ? "frame" : i <= 3 ? "image" : "dup"}
        {...(i > 0 && i <= 3 ? { "data-build-from": i % 2 ? "right" : "bottom" } : {})}
        className="logo-tile"
      >
        <img src={l.src} alt={l.name} />
      </li>
    ))}
  </ul>
</div>
```

The layout agent boxes the grid cells first. Then a few logos are dragged in
from the edges and the rest are duplicated. Without the explicit `image`
items, lists of 6+ with images pick a few drags automatically.

## 6. Image or video drag

```tsx
{/* Image: the thumbnail on the dragged card is the real image. */}
<div data-build-item data-build="image" data-build-from="left" className="media">
  <img src="/shot.png" alt="Dashboard screenshot" />
</div>

{/* Video: the poster frame is the thumbnail. Label it, there is no img file name. */}
<div data-build-item data-build="image" data-build-from="right" data-build-label="showreel.mp4" className="media aspect-[16/10]">
  <video muted loop playsInline preload="none" poster="/videos/showreel.webp">
    <source src="/videos/showreel.webm" type="video/webm" />
    <source src="/videos/showreel.mp4" type="video/mp4" />
  </video>
</div>
```

If the media has no `<img>` and no poster, the card shows a hatched
placeholder with the alt or aria-label text.

## 7. Metrics strip with color and scale

```tsx
<dl data-build-grid className="grid grid-cols-2 lg:grid-cols-4">
  {metrics.map((m, i) => (
    <div key={m.label} data-build-item data-build="frame" {...(i === 0 ? { "data-build-tune": "" } : {})} className="card">
      <dt className="order-2">{m.label}</dt>
      <dd
        data-build-item
        data-build="type"
        data-build-color="text"
        data-build-scale
        className="order-1 big-number tabular-nums"
        style={{ color: m.color }}
      >
        {m.value}
      </dd>
    </div>
  ))}
</dl>
```

Each number is typed small and neutral, scaled up, moved into place, then
colored from the wheel. Put the strip in the hero section (or its own
section). A `data-build-grid` on the `<dl>` gets the cells boxed first.

## 8. Timeline: one section per entry

```tsx
{jobs.map((job) => (
  <div key={job.company} data-build-section={`exp-${slug(job.company)}`}>
    <article data-build-item data-build="frame" data-build-tune data-build-label="role" className="card">
      <p data-build-item data-build="type" data-build-color="text" className="dates">{job.dates}</p>
      <h3 data-build-item data-build="type" data-build-font>{job.title} · {job.company}</h3>
      <ul data-build-item data-build="reveal">
        {job.points.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </article>
  </div>
))}
```

## 9. Finale

```tsx
<div data-build-section="contact" data-build-finale>
  <p data-build-item data-build="type" className="eyebrow">07 — contact</p>
  <h2 data-build-item data-build="type" data-build-font data-build-weight data-build-scale>
    Let's build something <em className="serif">good</em>
  </h2>
  <p data-build-item data-build="reveal">One line on what you are looking for.</p>
  <a
    data-build-item
    data-build="frame"
    data-build-color="fill"
    data-build-label="a.email"
    data-deploy-target
    data-deploy-text="live at example.com"
    href="mailto:you@example.com"
    className="btn primary"
  >
    you@example.com
  </a>
</div>
```

After the reviewer approves the section, the deployer clicks the email
button. A deploy panel runs, and the button pulses once it's "live".
