// Part of living-ui-skills (MIT). Adapt freely.
// https://github.com/anhlamtruong/living-ui-skills
// The build animation plays for every visitor, including systems set to
// reduced motion (the site owner's choice; a Skip button is always shown).
// - ?build=off turns it off for that page view.
// - ?build=force replays it even if this tab already watched it.

const OFF_RE = /[?&]build=off(&|$)/;

export function offByUrl(): boolean {
  return OFF_RE.test(window.location.search);
}
