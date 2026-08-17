/**
 * The rule between sections, carrying its name.
 *
 * `.divider` owns the page's vertical rhythm — clamp(32px, 5vw, 54px) above,
 * 20px below — so it has to be the thing that sets the spacing. Note that a
 * Tailwind `space-y-*` on the parent silently overwrites both margins (in v4
 * the utility writes `margin-block-end` on every child but the last, and
 * utilities outrank components), which is how the homework page ended up with
 * its section headings jammed against the panel above them.
 */
export function Rule({ label }: { label: string }) {
  return (
    <div className="divider">
      <span className="label">{label}</span>
      <span className="r" />
      <span className="m" />
    </div>
  );
}
