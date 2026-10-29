import { useState } from 'react';
import { apiDownload } from '../../lib/api.js';
import { rupees, TYPE_LABEL } from '../../lib/format.js';
import { useRetailerStats } from '../../hooks/useRetailerData.js';
import Button from '../Button.jsx';
import LoadingBlock from '../ui/LoadingBlock.jsx';
import { ErrorNote } from '../intake/fields.jsx';

const nf = new Intl.NumberFormat('en-IN');
const dayOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }) : null);

function Figure({ label, value, hint }) {
  return (
    <div className="bg-paper px-4 py-5 sm:px-6">
      <dt className="text-[14px] text-ink-soft">{label}</dt>
      <dd className="mt-1 text-[34px] font-light leading-none tracking-[-0.03em] tabular-nums">{value}</dd>
      {hint && <p className="mt-2 text-[13px] leading-snug text-ink-soft">{hint}</p>}
    </div>
  );
}

/** Anonymous counts of how often shoppers' looks used this retailer's items, with the number beside each bar. */
export default function RetailerUsage({ token, refreshKey }) {
  const { phase, data, error, reload } = useRetailerStats(token, refreshKey);
  const [dl, setDl] = useState({ busy: false, error: null });

  async function download() {
    setDl({ busy: true, error: null });
    try { await apiDownload('/api/retailer/stats.csv', { authToken: token, filename: 'ensemble-usage.csv' }); setDl({ busy: false, error: null }); }
    catch (e) { setDl({ busy: false, error: e }); }
  }

  const max = Math.max(1, ...(data?.topItems ?? []).map((r) => r.picks));
  return (
    <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6" aria-labelledby="usage-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="usage-title" className="text-[20px] font-medium tracking-[-0.02em]">How shoppers use your items</h2>
          <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">How often a shopper’s look included one of your items. Anonymous counts: never photos, skin readings, names or network addresses.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="h-11 px-4 text-sm" onClick={reload} disabled={phase === 'loading' || phase === 'refreshing'}>{phase === 'refreshing' ? 'Refreshing…' : 'Refresh'}</Button>
          <Button variant="secondary" className="h-11 px-4 text-sm" onClick={download} disabled={dl.busy || !data}>{dl.busy ? 'Preparing…' : 'Download CSV'}</Button>
        </div>
      </div>
      <ErrorNote error={dl.error} className="mt-4" />
      {phase === 'loading' && !data && <LoadingBlock label="Counting…" className="mt-6" />}
      {phase === 'error' && <div className="mt-6"><ErrorNote error={error} /></div>}
      {data && data.empty && (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-mist px-5 py-6" role="status">
          <p className="text-[17px] font-medium">Your items have not been picked yet</p>
          <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-ink-soft">Your items are live in the shared catalog. Numbers appear here once a shopper chooses a look that uses one. Nothing is estimated: until that happens every count is zero.</p>
        </div>
      )}
      {data && !data.empty && (
        <>
          <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
            <Figure label="Times picked" value={nf.format(data.totals.picks)} hint="Your items in looks shoppers chose" />
            <Figure label="Items picked" value={`${nf.format(data.totals.itemsPicked)} of ${nf.format(data.totals.itemsListed)}`} hint="At least once" />
            <Figure label="Not picked yet" value={nf.format(data.notYetPicked)} hint="Items no look has used" />
          </dl>
          <h3 className="mt-8 text-[16px] font-medium">Most chosen items</h3>
          <ol className="mt-3 space-y-3">
            {data.topItems.map((r) => (
              <li key={r.id}>
                <div className="flex items-baseline justify-between gap-4 text-[15px]">
                  <span className="min-w-0 break-words">{r.name}<span className="ml-2 text-[13px] text-ink-soft">{TYPE_LABEL[r.type]} · {rupees(r.price)}</span></span>
                  <span className="shrink-0 font-mono text-[14px] tabular-nums">{nf.format(r.picks)}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-line" aria-hidden="true"><div className="h-full rounded-full bg-ink/70" style={{ width: `${Math.max(4, Math.round((r.picks / max) * 100))}%` }} /></div>
              </li>
            ))}
          </ol>
        </>
      )}
      {data && <p className="mt-6 text-[13px] text-ink-soft">Counting since {dayOf(data.since) ?? 'the first session'}. {data.note}</p>}
    </section>
  );
}
