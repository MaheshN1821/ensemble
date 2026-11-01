import { useMemo, useState } from 'react';
import { METAL_LABEL, TYPE_LABEL, rupees } from '../../lib/format.js';
import { SLOTS, totalWith } from '../../lib/build.js';

const PLURAL = { outfit: 'Outfits', earrings: 'Earrings', lipstick: 'Lipsticks', blush: 'Blush', foundation: 'Foundation', eyewear: 'Eyewear', watch: 'Watches' };
const SORTS = { 'price-asc': 'Price, low to high', 'price-desc': 'Price, high to low', name: 'Name' };
const SORTERS = { 'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price, name: (a, b) => a.name.localeCompare(b.name) };

function Choice({ item, selected, onToggle, extra }) {
  const swatch = (item.type === 'lipstick' || item.type === 'blush' || item.type === 'foundation') ? (item.colours?.[0]?.hex || (typeof item.colours?.[0] === 'string' ? item.colours[0] : null)) : null;
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onToggle(item)}
        className={`group flex h-full w-full flex-col overflow-hidden rounded-2xl border text-left transition-colors ${selected ? 'border-rani bg-rani-wash' : 'border-line bg-paper hover:border-ink'}`}
      >
        <span className="relative block aspect-[4/5] w-full bg-white">
          <img src={item.imageUrl} alt="" loading="lazy" className="size-full object-contain p-3" />
          {selected && <span className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-full bg-rani text-[15px] text-white" aria-hidden="true">✓</span>}
          {swatch && <span className="absolute bottom-3 left-3 size-6 rounded-full border border-line" style={{ backgroundColor: swatch }} aria-hidden="true" />}
        </span>
        <span className="flex flex-1 flex-col gap-1 border-t border-line p-4 text-[14px] text-ink-soft">
          <span className="text-[16px] font-medium leading-snug text-ink">{item.name}</span>
          <span>{rupees(item.price)}{item.seller ? ` · ${item.seller}` : ''}</span>
          {(item.metalTone || item.style) && <span>{[item.metalTone ? METAL_LABEL[item.metalTone] : null, item.style ? `${item.style[0].toUpperCase()}${item.style.slice(1)}` : null].filter(Boolean).join(' · ')}</span>}
          {extra && <span className="mt-1 text-[13px] text-alert">{extra}</span>}
          <span className="mt-auto pt-2 text-[14px] font-medium text-rani">{selected ? 'Chosen. Tap to remove' : `Choose this ${TYPE_LABEL[item.type].toLowerCase()}`}</span>
        </span>
      </button>
    </li>
  );
}

/** The catalog, one kind at a time. Choosing is a toggle; a piece that would push the look over budget says so but can still be chosen. */
export default function ItemChoice({ items, counts, picks, onToggle, slot, onSlot, budget, byId, sellers }) {
  const [sort, setSort] = useState('price-asc');
  const [seller, setSeller] = useState('all');
  const shown = useMemo(
    () => items.filter((i) => i.type === slot && (seller === 'all' || i.seller === seller)).sort(SORTERS[sort]),
    [items, slot, seller, sort],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Kind of item">
        {SLOTS.map((s) => (
          <button
            key={s} type="button" aria-pressed={slot === s} onClick={() => onSlot(s)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] transition-colors ${slot === s ? 'border-rani bg-rani-wash text-rani-deep' : 'border-line bg-paper hover:border-ink'}`}
          >
            {PLURAL[s]} <span className="text-[13px] text-ink-soft">{counts[s]}</span>
            {picks[s] && <span className="text-peacock" aria-label="chosen">✓</span>}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-[14px] text-ink-soft">
        <label className="flex items-center gap-2">Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-11 rounded-xl border border-line bg-paper px-3 text-[15px] text-ink">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {sellers.length > 1 && (
          <label className="flex items-center gap-2">Sold by
            <select value={seller} onChange={(e) => setSeller(e.target.value)} className="h-11 max-w-[14rem] rounded-xl border border-line bg-paper px-3 text-[15px] text-ink">
              <option value="all">Everyone</option>
              {sellers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        <span role="status">{shown.length} {shown.length === 1 ? 'item' : 'items'}</span>
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line px-5 py-10 text-center text-ink-soft">No {PLURAL[slot].toLowerCase()} here yet.</p>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((item) => {
            const selected = picks[item.type] === item.id;
            const total = totalWith(picks, item, byId);
            const extra = !selected && total > budget ? `Takes the look ${rupees(total - budget)} over budget` : null;
            return <Choice key={item.id} item={item} selected={selected} onToggle={onToggle} extra={extra} />;
          })}
        </ul>
      )}
    </div>
  );
}
