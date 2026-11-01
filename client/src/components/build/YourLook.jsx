import { useEffect, useId, useState } from 'react';
import { TYPE_LABEL, rupees } from '../../lib/format.js';
import { SLOTS } from '../../lib/build.js';
import { ErrorNote } from '../intake/fields.jsx';

const SEE_LABEL = { done: 'Open my look', partial: 'Open my look', running: 'See it being drawn', failed: 'Try drawing it again' };

function Budget({ saved, value, onChange, range }) {
  const id = useId();
  const [text, setText] = useState(String(value ?? saved));
  useEffect(() => { setText(String(value ?? saved)); }, [value, saved]);
  const trying = value !== null && value !== saved;
  return (
    <form className="mt-5 border-t border-line pt-5" onSubmit={(e) => { e.preventDefault(); const n = Math.round(Number(text)); if (Number.isFinite(n)) onChange(n === saved ? null : n); }}>
      <label htmlFor={id} className="text-[14px] text-ink-soft">Budget for this look</label>
      <div className="mt-1 flex items-center gap-2">
        <div className="flex items-center rounded-xl border border-line bg-paper">
          <span className="pl-3 text-[16px] text-ink-soft" aria-hidden="true">₹</span>
          <input id={id} type="number" inputMode="numeric" min={range.min} max={range.max} step={range.step} value={text} onChange={(e) => setText(e.target.value)} className="h-11 w-28 bg-transparent px-2 text-[16px] outline-none" />
        </div>
        <button type="submit" className="inline-flex h-11 items-center rounded-full border border-line bg-paper px-4 text-[14px] hover:border-ink">Apply</button>
      </div>
      {trying && (
        <p className="mt-2 text-[13px] text-ink-soft">
          Trying a different budget here. Your saved budget of {rupees(saved)} is unchanged.{' '}
          <button type="button" onClick={() => onChange(null)} className="text-rani underline underline-offset-4">Use my saved budget</button>
        </p>
      )}
    </form>
  );
}

/** The look so far: what is chosen, what it costs against the budget, how it matches, and the button that draws it. */
export default function YourLook({ id, byId, picks, onRemove, onPick, preview, saved, budget, setBudget, range, onDraw, drawing, units, drawnStatus, onClear }) {
  const items = SLOTS.map((s) => [s, byId.get(picks[s])]);
  const look = preview.look;
  const total = items.reduce((n, [, i]) => n + (i?.price ?? 0), 0);
  const limit = look?.budgetInr ?? budget ?? saved;
  const over = total > limit;
  const ready = Object.keys(picks).length > 0 && Boolean(look) && !preview.busy && look.withinBudget;
  const why = Object.keys(picks).length === 0 ? 'Choose an outfit or an accessory to start.'
    : over ? `This look is ${rupees(total - limit)} over the budget. Swap a piece or try a higher budget.`
    : !look ? 'Checking your look…' : null;
  const pct = Math.min(100, Math.round((total / limit) * 100));

  return (
    <section id={id} aria-labelledby="your-look-h" className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="your-look-h" className="text-[20px] font-medium tracking-[-0.02em]">Your look</h2>
        {Object.keys(picks).length > 0 && <button type="button" onClick={onClear} className="text-[14px] text-ink-soft underline underline-offset-4 hover:text-rani">Clear all</button>}
      </div>

      <ul className="mt-4 divide-y divide-line border-y border-line">
        {items.map(([slot, item]) => (
          <li key={slot} className="flex items-center gap-3 py-3">
            <span className="block size-14 shrink-0 overflow-hidden rounded-lg border border-line bg-white">
              {item ? <img src={item.imageUrl} alt="" className="size-full object-contain p-1" /> : <span className="flex size-full items-center justify-center text-[12px] text-ink-soft" aria-hidden="true">–</span>}
            </span>
            <span className="min-w-0 flex-1 text-[14px]">
              <span className="block text-ink-soft">{TYPE_LABEL[slot]}{slot === 'outfit' ? '' : ' (optional)'}</span>
              {item ? <span className="block truncate text-[15px]">{item.name}</span> : <button type="button" onClick={() => onPick(slot)} className="text-[15px] text-rani underline underline-offset-4">Choose {slot === 'earrings' ? 'earrings' : slot === 'foundation' ? 'a foundation' : slot === 'blush' ? 'a blush' : `a ${slot}`}</button>}
            </span>
            {item && (
              <span className="shrink-0 text-right">
                <span className="block font-mono text-[13px]">{rupees(item.price)}</span>
                <button type="button" onClick={() => onRemove(slot)} className="min-h-8 text-[13px] text-alert underline underline-offset-4">Remove<span className="sr-only"> {item.name}</span></button>
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <p className="flex items-baseline justify-between text-[15px]">
          <span>{rupees(total)} of {rupees(limit)}</span>
          <span className={over ? 'text-alert' : 'text-ink-soft'}>{over ? `${rupees(total - limit)} over` : `${rupees(limit - total)} left`}</span>
        </p>
        <span className="mt-2 block h-1.5 rounded-full bg-mist" aria-hidden="true"><span className={`block h-full rounded-full ${over ? 'bg-alert' : 'bg-ink'}`} style={{ width: `${pct}%` }} /></span>
      </div>

      <Budget saved={saved} value={budget} onChange={setBudget} range={range} />

      {Object.keys(picks).length > 0 && (
        <div className="mt-5 border-t border-line pt-5" aria-live="polite">
          {preview.error && <ErrorNote error={preview.error} />}
          {!preview.error && !look && <p className="text-[15px] text-ink-soft">Checking your look…</p>}
          {look && (
            <>
              <p className="inline-block rounded-full border border-line px-3 py-1 text-[14px]">Match <span className="font-medium">{look.score}</span> of 100</p>
              {look.reasons.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-[15px] leading-snug">{look.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden="true" className="text-peacock">✓</span><span>{r}</span></li>)}</ul>
              )}
              {look.cautions.length > 0 && (
                <>
                  <h3 className="mt-4 text-[15px] font-medium">Worth knowing</h3>
                  <ul className="mt-2 space-y-1.5 text-[15px] leading-snug text-ink-soft">{look.cautions.map((r) => <li key={r} className="flex gap-2"><span aria-hidden="true">!</span><span>{r}</span></li>)}</ul>
                </>
              )}
              <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">The match score comes from the app’s styling rules. It is a guide, not a rule: it is your look.</p>
            </>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-line pt-5">
        <button type="button" onClick={onDraw} disabled={!ready || drawing.busy} aria-describedby="draw-note" className="inline-flex h-12 w-full items-center justify-center rounded-full bg-rani px-6 text-[15px] font-medium text-white hover:bg-rani-deep disabled:cursor-not-allowed disabled:opacity-50">
          {drawing.busy ? 'Starting…' : SEE_LABEL[drawnStatus] ?? 'See it on me'}
        </button>
        <p id="draw-note" className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          {why ?? (drawnStatus === 'done' ? 'Already drawn, so opening it costs nothing.' : units ? `Uses up to ${units} units. Anything already drawn is reused for free.` : 'Anything already drawn is reused for free.')}
        </p>
        <ErrorNote error={drawing.error} className="mt-3" />
      </div>
    </section>
  );
}
