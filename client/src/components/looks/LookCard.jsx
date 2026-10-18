import { TYPE_LABEL, rupees } from '../../lib/format.js';

const SLOT_ORDER = ['outfit', 'necklace', 'earrings', 'lipstick'];

function Thumb({ item }) {
  return (
    <img
      src={item.imageUrl}
      alt={`${item.name}${item.source === 'sample' ? ' (sample illustration)' : ''}`}
      className="size-full object-contain p-2"
      loading="lazy"
    />
  );
}

/** Points per scoring part, as text and bars. Bars are decoration: the numbers carry the meaning. */
function Breakdown({ components }) {
  return (
    <details className="mt-5 border-t border-line pt-4">
      <summary className="cursor-pointer text-[15px] text-ink-soft hover:text-ink">How this score adds up</summary>
      <table className="mt-3 w-full text-left text-[14px]">
        <caption className="sr-only">Score by part</caption>
        <thead className="text-ink-soft">
          <tr><th scope="col" className="py-1 pr-3 font-normal">Part</th><th scope="col" className="py-1 text-right font-normal">Points</th></tr>
        </thead>
        <tbody>
          {Object.entries(components).map(([key, c]) => (
            <tr key={key} className="border-t border-line">
              <th scope="row" className="py-2 pr-3 font-normal">
                {c.label}
                <span className="mt-1 block h-1.5 w-full max-w-[10rem] rounded-full bg-mist" aria-hidden="true">
                  <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.round(c.value * 100)}%` }} />
                </span>
              </th>
              <td className="py-2 text-right font-mono text-[13px]">{c.points} of {c.weight}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export default function LookCard({ look, scoreNote, label, onTryBudget, closest = false }) {
  const items = SLOT_ORDER.map((s) => look.items[s]).filter(Boolean);
  const outfit = look.items.outfit;
  const small = items.filter((i) => i.type !== 'outfit');
  const headingId = `look-${look.id}`;
  return (
    <article aria-labelledby={headingId} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="grid grid-cols-[1fr_5.5rem] gap-px bg-line">
        <div className="relative aspect-[4/5] bg-white">
          <Thumb item={outfit} />
          {outfit.source === 'sample' && <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-white">Sample</span>}
        </div>
        <ul className="flex flex-col gap-px bg-line" aria-label="Jewellery and lipstick">
          {small.map((i) => <li key={i.id} className="flex-1 bg-white"><Thumb item={i} /></li>)}
          {small.length === 0 && <li className="flex-1 bg-white p-2 text-[12px] text-ink-soft">No jewellery</li>}
        </ul>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={headingId} className="text-[20px] font-medium tracking-[-0.02em]">{label}</h2>
            <p className="mt-1 text-[15px] text-ink-soft">
              {rupees(look.totalPrice)} of {rupees(look.budgetInr)}
              {look.withinBudget ? '' : ` (${rupees(look.overBy)} over)`}
            </p>
          </div>
          <p className="shrink-0 rounded-full border border-line px-3 py-1 text-[14px]" title={scoreNote}>
            Match <span className="font-medium">{look.score}</span> of 100
          </p>
        </div>

        <ul className="mt-4 divide-y divide-line border-y border-line text-[15px]" aria-label="Items in this look">
          {items.map((i) => (
            <li key={i.id} className="flex items-baseline justify-between gap-4 py-2.5">
              <span><span className="text-ink-soft">{TYPE_LABEL[i.type]}: </span>{i.name}</span>
              <span className="shrink-0 font-mono text-[13px]">{rupees(i.price)}</span>
            </li>
          ))}
        </ul>

        {look.reasons.length > 0 && (
          <>
            <h3 className="mt-5 text-[15px] font-medium">Why we picked it</h3>
            <ul className="mt-2 space-y-1.5 text-[15px] leading-snug">
              {look.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden="true" className="text-peacock">✓</span><span>{r}</span></li>)}
            </ul>
          </>
        )}
        {look.cautions.length > 0 && (
          <>
            <h3 className="mt-4 text-[15px] font-medium">Worth knowing</h3>
            <ul className="mt-2 space-y-1.5 text-[15px] leading-snug text-ink-soft">
              {look.cautions.map((r) => <li key={r} className="flex gap-2"><span aria-hidden="true">!</span><span>{r}</span></li>)}
            </ul>
          </>
        )}

        <Breakdown components={look.components} />
        <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">{scoreNote}</p>
        {closest && onTryBudget && (
          <div className="mt-5">
            <button type="button" onClick={onTryBudget} className="inline-flex h-11 items-center rounded-full bg-rani px-5 text-[15px] font-medium text-white hover:bg-rani-deep">
              Plan with {rupees(look.totalPrice)}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
