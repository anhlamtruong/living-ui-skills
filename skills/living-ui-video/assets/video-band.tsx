// Part of living-ui-skills (MIT). Adapt freely.
// A decorative full-width looping clip between two sections, with small mono readouts above it.
import { LoopVideo } from "./loop-video";

type VideoBandProps = {
  /** public/videos/<name>.{webm,mp4,webp}, rendered at 1920×320 (6:1). */
  name: string;
  /** Left readout, e.g. "reel 01 · pipeline". */
  reel: string;
  /** Middle readout, hidden on phones. */
  caption?: string;
  /** Right readout. */
  meta?: string;
  width?: number;
  height?: number;
};

export function VideoBand({
  name,
  reel,
  caption,
  meta = "1920 × 320 · 30 fps · loop",
  width = 1920,
  height = 320,
}: VideoBandProps) {
  // Decorative: hidden from assistive tech, no pause toggle, no label.
  return (
    <div aria-hidden="true" className="lv-band">
      <div className="lv-band__meta">
        <span>{reel}</span>
        {caption ? <span className="lv-band__caption">{caption}</span> : null}
        <span>{meta}</span>
      </div>
      <LoopVideo name={name} width={width} height={height} className="lv-band__clip" />
    </div>
  );
}
