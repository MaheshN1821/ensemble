import { FAMILY_LABEL, METAL_LABEL, TYPE_LABEL, rupees } from '../../lib/format.js';

function Colours({ colours }) {
  if (!colours?.length) return <span className="text-ink-soft">Colours not read</span>;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="Colours">
      {colours.map((c) => (
        <li key={c.family} className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-full border border-line" style={{ backgroundColor: c.hex }} aria-hidden="true" />
          {FAMILY_LABEL(c.family)}
        </li>
      ))}
    </ul>
  );
}

function Card({ item, onRemove, busy }) {
  const sample = item.source === 'sample';
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="relative aspect-[4/5] bg-white">
        <img
          src={item.imageUrl}
          alt={`${item.name}${sample ? ' (sample illustration)' : ''}`}
          loading="lazy"
          className="size-full object-contain p-3"
        />
        <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-white">
          {sample ? 'Sample' : TYPE_LABEL[item.type]}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 border-t border-line p-4 text-[14px] text-ink-soft">
        <div>
          <p className="text-[16px] font-medium leading-snug text-ink">{item.name}</p>
          <p className="mt-0.5">{sample ? `${TYPE_LABEL[item.type]} · ` : ''}{rupees(item.price)}</p>
        </div>
        <Colours colours={item.colours} />
        <p>
          {item.metalTone ? `${METAL_LABEL[item.metalTone]} · ` : ''}
          Formality {item.formality} of 5
          {item.style ? ` · ${item.style[0].toUpperCase()}${item.style.slice(1)}` : ''}
        </p>
        {item.occasions?.length > 0 && <p>{item.occasions.map((o) => o.replace(/-/g, ' ')).join(', ')}</p>}
        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1">
          {item.productUrl && (
            <a href={item.productUrl} target="_blank" rel="noopener noreferrer" className="text-rani underline underline-offset-4">
              Product page<span className="sr-only"> for {item.name} (opens in a new tab)</span>
            </a>
          )}
          {onRemove && (
            <button type="button" disabled={busy} onClick={() => onRemove(item)} className="text-alert underline underline-offset-4 disabled:opacity-50">
              Remove<span className="sr-only"> {item.name}</span>
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ItemGrid({ items, onRemove, busy }) {
  if (!items.length) return <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-ink-soft">No items of this type yet.</p>;
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => <Card key={item.id} item={item} onRemove={onRemove} busy={busy} />)}
    </ul>
  );
}
