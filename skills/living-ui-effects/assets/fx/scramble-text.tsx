// Part of living-ui-skills (MIT). Adapt freely.
// Markup hook for the scramble effect (scramble.ts). Server-safe: no hooks.
// Wrap only the label text of a link or button, never its icons:
//   <a className="btn"><Icon /> <ScrambleText>{label}</ScrambleText></a>
// Use `inline` when the parent is a plain inline link (not flex), so the
// link's underline still reaches the text. Use `quiet` on filled buttons
// (with --fx-scr-tail: currentColor on the button) for a softer glyph tail.

export function ScrambleText({
  children,
  inline = false,
  quiet = false,
}: {
  children: string;
  inline?: boolean;
  quiet?: boolean;
}) {
  const cls = `fx-scr${inline ? " fx-scr--inline" : ""}${quiet ? " fx-scr--quiet" : ""}`;
  return (
    <span className={cls} data-fx-scr="">
      <span className="fx-scr__txt">{children}</span>
      <span className="fx-scr__fx" aria-hidden="true">
        <span className="fx-scr__done" />
        <span className="fx-scr__tail" />
      </span>
    </span>
  );
}
