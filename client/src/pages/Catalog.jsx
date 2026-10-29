import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { TYPE_LABEL } from '../lib/format.js';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import Button from '../components/Button.jsx';
import ItemGrid from '../components/catalog/ItemGrid.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] sm:text-[44px]';
const TYPES = ['all', 'outfit', 'necklace', 'earrings', 'lipstick'];

function Shell({ children }) {
  return <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">{children}</section>;
}

/** The shared catalog: everything every retailer has uploaded, open to everyone. Shoppers plan their looks from these items. */
export default function Catalog() {
  const [state, setState] = useState({ phase: 'loading', data: null, error: null });
  const [type, setType] = useState('all');
  const [seller, setSeller] = useState('all');

  const load = useCallback(async () => {
    setState((s) => ({ ...s, phase: 'loading', error: null }));
    try { setState({ phase: 'ready', data: await api('/api/catalog'), error: null }); }
    catch (error) { setState({ phase: 'error', data: null, error }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const items = state.data?.items;
  const shown = useMemo(() => (items ?? []).filter((i) => (type === 'all' || i.type === type) && (seller === 'all' || i.seller === seller)), [items, type, seller]);

  if (state.phase === 'loading') return <Shell><LoadingBlock label="Loading the catalog…" cards={3} /></Shell>;
  if (state.phase === 'error') {
    return <Shell><h1 className={H1}>We could not load the catalog</h1><ErrorNote error={state.error} className="mt-6 max-w-xl" /><div className="mt-8 flex gap-3"><Button onClick={load}>Try again</Button></div></Shell>;
  }

  const { catalog } = state.data;
  return (
    <Shell>
      <h1 className={H1}>{catalog.name}</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">Every outfit, necklace, pair of earrings and lipstick from every retailer on Ensemble. Your looks are planned from these items. No account needed.</p>
      <p className="mt-3 text-[15px] text-ink-soft">
        {catalog.itemCount} items: {catalog.counts.outfit} outfits, {catalog.counts.necklace} necklaces, {catalog.counts.earrings} earrings, {catalog.counts.lipstick} lipsticks.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by item type">
        {TYPES.map((t) => (
          <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] transition-colors ${type === t ? 'border-rani bg-rani-wash text-rani-deep' : 'border-line bg-paper hover:border-ink'}`}>
            {t === 'all' ? 'All items' : `${TYPE_LABEL[t]}s`.replace('Earringss', 'Earrings')}
          </button>
        ))}
        {catalog.sellers.length > 1 && (
          <label className="ml-auto flex items-center gap-2 text-[14px] text-ink-soft">Sold by
            <select value={seller} onChange={(e) => setSeller(e.target.value)} className="h-11 max-w-[14rem] rounded-xl border border-line bg-paper px-3 text-[15px] text-ink">
              <option value="all">Everyone</option>
              {catalog.sellers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="mt-6"><ItemGrid items={shown} /></div>
      <p className="mt-10 text-[14px] text-ink-soft">Prices are in rupees. Items link out to the retailer’s own page; there is no checkout here. Are you a retailer? <Link to="/retailer" className="text-rani underline underline-offset-4">Add your items</Link>.</p>
    </Shell>
  );
}
