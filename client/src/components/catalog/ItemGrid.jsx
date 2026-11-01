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

function Card({ item, onRemove, busy, selected, onTogglePick, slotPickedOther }) {
  const isMakeup = ['lipstick', 'blush', 'foundation'].includes(item.type);
  const swatch = isMakeup ? (item.colours?.[0]?.hex || (typeof item.colours?.[0] === 'string' ? item.colours[0] : null)) : null;
  return (
    <li className={`flex flex-col overflow-hidden rounded-2xl border transition-all ${selected ? 'border-rani ring-1 ring-rani/30 bg-paper shadow-sm' : 'border-line bg-paper hover:border-ink/50'}`}>
      <div className="relative aspect-[4/5] bg-white">
        <img
          src={item.imageUrl}
          alt={item.name}
          loading="lazy"
          className="size-full object-contain p-3"
        />
        <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-white">
          {TYPE_LABEL[item.type]}
        </span>
        {selected && (
          <span
            className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-full bg-rani text-[15px] font-medium text-white shadow-sm"
            aria-label="Selected for virtual try-on"
          >
            ✓
          </span>
        )}
        {swatch && (
          <span
            className="absolute bottom-3 left-3 size-6 rounded-full border border-line shadow-sm"
            style={{ backgroundColor: swatch }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 border-t border-line p-4 text-[14px] text-ink-soft">
        <div>
          <p className="text-[16px] font-medium leading-snug text-ink">{item.name}</p>
          <p className="mt-0.5">{rupees(item.price)}{item.seller ? ` · Sold by ${item.seller}` : ''}</p>
        </div>
        <Colours colours={item.colours} />
        <p>
          {item.metalTone ? `${METAL_LABEL[item.metalTone]} · ` : ''}
          Formality {item.formality} of 5
          {item.style ? ` · ${item.style[0].toUpperCase()}${item.style.slice(1)}` : ''}
        </p>
        {item.occasions?.length > 0 && <p>{item.occasions.map((o) => o.replace(/-/g, ' ')).join(', ')}</p>}

        {onTogglePick && (
          <div className="pt-1">
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onTogglePick(item)}
              className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-4 text-[14px] font-medium transition-colors ${
                selected
                  ? 'border-rani bg-rani text-white hover:bg-rani-deep'
                  : slotPickedOther
                  ? 'border-line bg-mist/60 text-ink hover:border-rani hover:text-rani'
                  : 'border-line bg-paper text-ink hover:border-rani hover:text-rani'
              }`}
            >
              {selected ? (
                <>
                  <span aria-hidden="true">✓</span> Selected for try-on
                </>
              ) : slotPickedOther ? (
                <>
                  <span aria-hidden="true">⇄</span> Swap into try-on
                </>
              ) : (
                <>
                  <span aria-hidden="true">+</span> Select for try-on
                </>
              )}
            </button>
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-2">
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

export default function ItemGrid({ items, onRemove, busy, empty = 'No items of this type yet.', picks = {}, onTogglePick }) {
  if (!items.length) return <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-ink-soft">{empty}</p>;
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => {
        const selected = Boolean(picks && picks[item.type] === item.id);
        const slotPickedOther = Boolean(!selected && picks && picks[item.type]);
        return (
          <Card
            key={item.id}
            item={item}
            onRemove={onRemove}
            busy={busy}
            selected={selected}
            onTogglePick={onTogglePick}
            slotPickedOther={slotPickedOther}
          />
        );
      })}
    </ul>
  );
}
