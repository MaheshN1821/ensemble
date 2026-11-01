import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SLOTS, pickedIds, totalOf } from '../../lib/build.js';
import { TYPE_LABEL, rupees } from '../../lib/format.js';
import Button from '../Button.jsx';

const SLOT_LABEL = {
  outfit: 'Outfit',
  earrings: 'Earrings',
  lipstick: 'Lipstick',
  eyewear: 'Eyewear',
  watch: 'Watch',
};

function SlotChip({ slot, item, onRemove, onSlotClick }) {
  if (!item) {
    return (
      <button
        type="button"
        onClick={() => onSlotClick?.(slot)}
        className="group flex h-14 items-center gap-2 rounded-xl border border-dashed border-line bg-mist/50 px-3 text-left transition-colors hover:border-rani hover:bg-rani-wash/30 focus-visible:outline-rani"
        title={`Filter catalog to ${SLOT_LABEL[slot]}`}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-[14px] text-ink-soft group-hover:border-rani group-hover:text-rani">
          +
        </span>
        <span className="text-[13px] leading-tight">
          <span className="block font-medium text-ink group-hover:text-rani">{SLOT_LABEL[slot]}</span>
          <span className="block text-[11px] text-ink-soft">{slot === 'outfit' ? 'Required' : 'Optional'}</span>
        </span>
      </button>
    );
  }

  const swatch = slot === 'lipstick' ? item.colours?.[0]?.hex : null;

  return (
    <div className="flex h-14 items-center gap-2 rounded-xl border border-rani/40 bg-rani-wash/40 p-1.5 pr-2.5 transition-colors">
      <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-line bg-white">
        <img src={item.imageUrl} alt="" className="size-full object-contain p-1" />
        {swatch && (
          <span
            className="absolute bottom-0.5 left-0.5 size-3.5 rounded-full border border-line"
            style={{ backgroundColor: swatch }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="min-w-0 flex-1 text-left text-[13px] leading-tight">
        <span className="block truncate font-medium text-ink max-w-[10rem]">{item.name}</span>
        <span className="block text-[12px] text-ink-soft">{rupees(item.price)}</span>
      </div>
      <button
        type="button"
        onClick={() => onRemove?.(slot)}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-alert-wash hover:text-alert focus-visible:outline-rani"
        aria-label={`Remove ${item.name} from try-on`}
      >
        <span aria-hidden="true" className="text-[16px] leading-none">×</span>
      </button>
    </div>
  );
}

/**
 * Floating bar on the catalog page that shows items selected for virtual try-on,
 * their running total, and provides a direct path to preview and render the look.
 */
export default function TryOnBar({ picks = {}, byId = new Map(), onRemove, onClear, onSlotClick }) {
  const [expanded, setExpanded] = useState(true);
  const ids = pickedIds(picks);
  const count = ids.length;

  if (count === 0) return null;

  const total = totalOf(picks, byId);
  const hasOutfit = Boolean(picks.outfit);
  const buildUrl = `/build?items=${ids.join(',')}`;

  return (
    <aside
      aria-label="Virtual try-on selection"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 shadow-[0_-8px_30px_rgba(20,18,43,0.08)] backdrop-blur-md"
    >
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-8 sm:py-4">
        {/* Top summary row: Always visible */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex size-3 rounded-full ${hasOutfit ? 'bg-peacock' : 'bg-zari'}`}
              aria-hidden="true"
            />
            <div>
              <p className="text-[15px] font-medium text-ink">
                Virtual try-on · <span className="font-semibold">{rupees(total)}</span>
                <span className="ml-2 font-normal text-ink-soft">
                  ({count} of {SLOTS.length} {count === 1 ? 'piece' : 'pieces'})
                </span>
              </p>
              <p className="text-[12px] text-ink-soft">
                {hasOutfit
                  ? 'Outfit selected · ready for virtual try-on'
                  : 'Select an outfit to see the look drawn on you'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex min-h-11 items-center gap-1 px-2 text-[13px] text-ink-soft hover:text-ink md:hidden"
              aria-expanded={expanded}
              aria-label={expanded ? 'Hide selected pieces' : 'Show selected pieces'}
            >
              <span>{expanded ? 'Hide pieces' : 'View pieces'}</span>
              <span aria-hidden="true">{expanded ? '▾' : '▴'}</span>
            </button>

            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-11 items-center px-3 text-[14px] text-ink-soft hover:text-alert"
            >
              Clear
            </button>

            <Button
              to={buildUrl}
              className="h-11 px-5 text-[14px] font-medium shadow-sm"
            >
              {hasOutfit ? 'Virtual try-on →' : 'Open in builder →'}
            </Button>
          </div>
        </div>

        {/* Detailed slot cards row: on desktop or when expanded on mobile */}
        {expanded && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line/60 pt-3 sm:grid-cols-3 lg:grid-cols-5">
            {SLOTS.map((s) => (
              <SlotChip
                key={s}
                slot={s}
                item={byId.get(picks[s])}
                onRemove={onRemove}
                onSlotClick={onSlotClick}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
