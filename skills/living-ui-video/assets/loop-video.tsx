// Part of living-ui-skills (MIT). Adapt freely.
// A muted, looping clip that never slows the page: poster first, idle warm-up, plays only on screen.
"use client";

import { useEffect, useRef, useState } from "react";
import "./video.css";

// Files expected for each clip (written by scripts/encode.mjs):
//   <basePath>/<name>.webm   VP9, smaller, first choice
//   <basePath>/<name>.mp4    H.264 fallback (Safari, older devices)
//   <basePath>/<name>.webp   poster = frame 0
//
// Loading order:
//   1. The poster paints with the HTML (preload="none", no video bytes yet).
//   2. After window "load" and an idle callback, clips are fetched one at a
//      time in page order, so the first one you scroll to is ready first.
//      Skipped on Save-Data and 2G connections.
//   3. An IntersectionObserver plays a clip when it nears the viewport and
//      pauses it when it leaves, so off-screen clips cost no decode time.

/** Bump when you re-render the clips: the files are served with a long cache. */
export const VIDEO_VERSION = "1";

type LoopVideoProps = {
  /** File name without extension: <basePath>/<name>.{webm,mp4,webp} */
  name: string;
  /** Accessible description. Leave out for purely decorative clips (they get aria-hidden). */
  label?: string;
  /** Intrinsic size of the render, used for the aspect ratio before the poster loads. */
  width: number;
  height: number;
  className?: string;
  /** Show a small pause/play button (needed for informative clips longer than 5 s, WCAG 2.2.2). */
  toggle?: boolean;
  basePath?: string;
  version?: string;
};

// ---- idle warm-up queue, shared by every clip on the page --------------------

const queue = new Set<HTMLVideoElement>();
let warming = false;

type NetworkInformationLike = { saveData?: boolean; effectiveType?: string };

function canWarmUp(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) return true;
  return !(connection.saveData || connection.effectiveType === "2g" || connection.effectiveType === "slow-2g");
}

function whenIdle(callback: () => void): void {
  const requestIdle = (
    window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }
  ).requestIdleCallback;
  if (requestIdle) requestIdle(callback, { timeout: 3000 });
  else window.setTimeout(callback, 1200);
}

function byPageOrder(a: HTMLVideoElement, b: HTMLVideoElement): number {
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function warmNext(): void {
  const next = [...queue]
    .filter((video) => video.isConnected && video.readyState === 0 && video.preload === "none")
    .sort(byPageOrder)[0];
  if (!next) {
    warming = false;
    return;
  }
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    next.removeEventListener("loadeddata", settle);
    next.removeEventListener("error", settle);
    whenIdle(warmNext);
  };
  next.addEventListener("loadeddata", settle);
  next.addEventListener("error", settle);
  window.setTimeout(settle, 6000); // a stalled request must not block the queue
  next.preload = "auto";
  next.load();
}

function startWarmUp(): void {
  if (warming || !canWarmUp()) return;
  warming = true;
  const begin = () => whenIdle(warmNext);
  if (document.readyState === "complete") begin();
  else window.addEventListener("load", begin, { once: true });
}

// -----------------------------------------------------------------------------

export function LoopVideo({
  name,
  label,
  width,
  height,
  className = "",
  toggle = false,
  basePath = "/videos",
  version = VIDEO_VERSION,
}: LoopVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausedByUser = useRef(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // React sets `muted` as a property, not always as an attribute in the
    // server HTML; autoplay policies need it to be true before play().
    video.muted = true;
    video.defaultMuted = true;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !pausedByUser.current) {
          if (video.preload === "none") video.preload = "auto";
          video.play().catch(() => {
            // Autoplay can still be refused (e.g. iOS Low Power Mode): the poster stays.
          });
        } else {
          video.pause();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(video);
    queue.add(video);
    startWarmUp();

    return () => {
      observer.disconnect();
      queue.delete(video);
    };
  }, []);

  const handleToggle = () => {
    const video = videoRef.current;
    if (!video) return;
    pausedByUser.current = !pausedByUser.current;
    setPaused(pausedByUser.current);
    if (pausedByUser.current) video.pause();
    else video.play().catch(() => {});
  };

  const src = `${basePath}/${name}`;
  const a11y = label ? { "aria-label": label } : { "aria-hidden": true as const };

  return (
    <div className={`lv-video ${className}`}>
      <video
        ref={videoRef}
        className="lv-video__media"
        width={width}
        height={height}
        poster={`${src}.webp?v=${version}`}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        disableRemotePlayback
        tabIndex={-1}
        {...a11y}
      >
        <source src={`${src}.webm?v=${version}`} type="video/webm" />
        <source src={`${src}.mp4?v=${version}`} type="video/mp4" />
      </video>
      {toggle ? (
        <button
          type="button"
          className="lv-video__toggle"
          onClick={handleToggle}
          aria-pressed={paused}
          aria-label={paused ? `Play ${label ?? "video"}` : `Pause ${label ?? "video"}`}
        >
          <span aria-hidden="true">{paused ? "▶ play" : "❚❚ pause"}</span>
        </button>
      ) : null}
    </div>
  );
}
