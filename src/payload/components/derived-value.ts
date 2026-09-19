/**
 * When a derived field should keep following the field it copies.
 *
 * `displayName` and `slug` on a trail are, in practice, always the trail name —
 * the first verbatim, the second lowercased with dashes. Both were
 * required-but-empty on a new trail, and a blank slug meant the trail's
 * elevation chart had nowhere to come from, with nothing on screen connecting
 * the two.
 *
 * The hard part is deciding when to stop, and the obvious rule is wrong. "Only
 * fill a blank" looks right and produces a trail named `P`: the first keystroke
 * of the name fills the field with one letter, after which it isn't blank, so
 * it never updates again.
 *
 * The test is **ownership, not emptiness** — keep writing while the field still
 * holds the last value we put there, stop as soon as it holds something a
 * person typed. That gives all three behaviours at once:
 *
 *   - typing a name fills the field a letter at a time, live;
 *   - editing the field yourself stops it following, permanently;
 *   - an existing trail is never touched, because nothing here wrote its value.
 *
 * That last one is not incidental. Display names are routinely deliberately
 * different from the raw tileset `trailName`, and slugs don't all match their
 * names — `slugify('Tiddlywinks (Upper)')` is `tiddlywinks-(upper)` while the
 * trail is `tiddlywinks-upper`, with a static elevation file named after it.
 * Rewriting on open would break a chart by visiting a page.
 *
 * Kept free of Payload imports so the rule can be tested on its own.
 */
export function shouldFollow({
  current,
  derived,
  focused,
  lastApplied,
  readOnly,
}: {
  current: string;
  derived: string;
  focused: boolean;
  /** The last value the caller wrote, or null if it has never written one. */
  lastApplied: null | string;
  readOnly?: boolean;
}): boolean {
  if (readOnly || !derived || current === derived) {
    return false;
  }
  // Typing in the field itself must never be interrupted — without this,
  // clearing it to write something else refills it between keystrokes.
  if (focused) {
    return false;
  }
  // Ours to write if we wrote what's there, or if there's nothing there. An
  // empty field re-arms deliberately: clearing it is how you ask for the
  // default back.
  return current === '' || current === lastApplied;
}
