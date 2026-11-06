# Embedding and loading

How `assets/loop-video.tsx` keeps seven clips from costing the page anything at first paint, and the layout patterns that use it.

## Contents

- [The loading strategy and why](#the-loading-strategy-and-why)
- [Details that are easy to get wrong](#details-that-are-easy-to-get-wrong)
- [Layout patterns](#layout-patterns)
- [Accessibility](#accessibility)
- [Caching and versioning](#caching-and-versioning)
- [Keeping the repo and deploys lean](#keeping-the-repo-and-deploys-lean)

## The loading strategy and why

1. **Poster first.** The server HTML contains `<video preload="none" poster="...webp">`. The browser paints the poster as an image and downloads no video bytes. The first paint, LCP and the main thread are unaffected, and the page can stay statically prerendered.
2. **Idle warm-up, one at a time, in page order.** After the window `load` event and a `requestIdleCallback`, a shared queue sets `preload="auto"` on the first unloaded clip (in DOM order) and calls `load()`. When that clip fires `loadeddata`, or errors, or 6 s pass, the next one starts. Everything is ready by the time someone scrolls to it, and seven clips never compete with the page's own scripts and fonts.
3. **Data saver respected.** The warm-up is skipped when `navigator.connection.saveData` is set or the connection is 2G. On those connections clips load only when they come near the viewport.
4. **Play only on screen.** An `IntersectionObserver` with `rootMargin: "200px 0px"` calls `play()` as a clip approaches the viewport and `pause()` when it leaves. Off-screen clips cost no decode work, and coming back to one resumes where it left off.
5. **Autoplay refusal is fine.** `play()` can reject (iOS Low Power Mode). The promise is caught and the poster stays up, which is why frame 0 must look finished.

In the worked example the effect was measured with headless Chromium: by the time the hero build finished (~9 s), all seven clips had `readyState` 4, and only the one on screen was playing.

## Details that are easy to get wrong

- **`muted` from JS.** React treats `muted` as a property and doesn't always write it into server-rendered HTML. Autoplay policies require a muted element, so the component sets `video.muted = true` and `video.defaultMuted = true` in its effect before any `play()`.
- **`playsInline`** must be there, or iOS opens playback full screen.
- **Never `autoplay` or `preload="auto"` in the server HTML.** Either one starts downloads during page load. `scripts/check-videos.mjs` fails if it finds them.
- **`width` and `height` attributes** give the element its aspect ratio before the poster loads, so nothing shifts. The slot also has an explicit aspect ratio (`aspect-[16/10]`) or height (`clamp(...)` for bands).
- **WebM before MP4** in the `<source>` list. Chrome, Edge and Firefox take the smaller VP9 file, and Safari falls through to H.264.
- **`?v=` on every URL**, including the poster (see caching).
- **`disablePictureInPicture` and `disableRemotePlayback`** keep browser chrome off a decorative loop.
- **`tabIndex={-1}`** so the video itself never takes focus; the pause button does.

## Layout patterns

### Hero "preview window"

A framed window next to the headline, with a mono title bar. It reads as "this is a live system", not "this is an ad".

```tsx
<div className="lv-window">
  <div className="lv-window__bar">
    <span>preview://showreel.mp4</span>
    <span><span className="lv-live-dot" aria-hidden="true" />live · loop</span>
  </div>
  <div className="aspect-[16/10]">
    <LoopVideo
      name="showreel"
      label="Showreel: agents plan, code, test, review and ship software"
      width={1280}
      height={800}
      toggle
      className="h-full w-full"
    />
  </div>
</div>
```

Don't repeat the page headline inside the video; the window sits right next to it.

### Card media

Replace a card's static image with the clip, keep the card's overlays (badge, index) on top, and leave those corners empty in the video.

```tsx
<div className="relative aspect-[16/10] overflow-hidden border-b">
  {project.video ? (
    <LoopVideo name={project.video} label={`${project.title}: animated preview`} width={1280} height={800} toggle className="h-full w-full" />
  ) : (
    <Image src={project.image} alt="" fill />
  )}
  <span className="absolute left-4 top-4">{project.badge}</span>
</div>
```

Store the clip name next to the content (a `video?: string` field on the project record) so the content file stays the single source of truth.

### Full-width band between sections

`<VideoBand name="band-pipeline" reel="reel 01 · pipeline" caption="..." />`. It is decorative (`aria-hidden`, no toggle). Its height is `clamp(150px, 16.67vw, 320px)`, which follows the 6:1 render on wide screens and stops shrinking on phones, where `object-fit: cover` crops the sides. A horizontal mask fades both edges into the page.

Place bands between sections, not inside them, so they never interfere with section padding or headings.

### Working with an entrance animation

If the page animates elements into place on load or scroll, two things matter:

- Give the animation something to show. The worked example's engine draws a dragged-in card from an element's image; for clips it loads `video[poster]` as an `Image` and uses the poster frame.
- Clips may keep playing while their section builds around them. That's fine, and it looks alive. Don't gate playback on the animation; gate only effects that move or measure the element.

## Accessibility

- **WCAG 2.2.2 (Pause, Stop, Hide).** Moving content that starts automatically, lasts more than 5 s and sits next to other content needs a way to pause it. Informative clips (hero, cards) get `toggle`: a small pill in the corner, hidden until hover or focus on pointer devices and always visible on touch. Its `aria-pressed` and label flip between pause and play.
- **Decorative clips** (bands) are `aria-hidden` with no label. They don't convey information.
- **Labels** describe what the clip shows (`"FinHack: animated preview"`), not that it's a video.
- **Reduced motion** is a product decision. The worked example plays for everyone because the owner wanted the site's motion on by default. If you respect `prefers-reduced-motion` instead, skip the warm-up and never call `play()` under it; the poster carries the design.

## Caching and versioning

```ts
// next.config.ts
const nextConfig = {
  async headers() {
    return [
      {
        source: "/videos/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" }],
      },
    ];
  },
};
```

- Without this, Vercel serves `public/` files with `max-age=0, must-revalidate`, so every visit revalidates every clip.
- File names don't change when you re-render, so bump `VIDEO_VERSION` in `loop-video.tsx` (or pass `version`). The `?v=` query makes the new files a cache miss.
- Vercel and most CDNs answer HTTP range requests for static files, which Safari needs for MP4. Check for `accept-ranges: bytes` on one clip after deploying.

## Keeping the repo and deploys lean

- Commit the HyperFrames sources (`video/<name>/index.html`, `compositions/`, `assets/`) so clips can be re-rendered. Ignore renders, snapshots, `.hyperframes/` and `node_modules/`.
- Add `video/` to `.vercelignore`. The build only needs `public/videos/`.
- The encoded clips are small enough for git (a few hundred KB each). Past a few dozen MB, move them to object storage or Git LFS.
