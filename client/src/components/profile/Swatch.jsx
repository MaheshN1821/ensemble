/** A colour sample with its name in text, so the colour is never the only signal. */
export default function Swatch({ hex, label, size = 'size-12' }) {
  return (
    <li className="flex w-[4.75rem] flex-col items-center gap-2 text-center">
      <span className={`${size} rounded-full border border-line`} style={{ backgroundColor: hex }} aria-hidden="true" />
      <span className="text-[13px] leading-tight text-ink">{label}</span>
    </li>
  );
}

export function SwatchRow({ items, label }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-x-3 gap-y-5">
      {items.map((c) => <Swatch key={c.id} hex={c.hex} label={c.label} />)}
    </ul>
  );
}
