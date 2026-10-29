import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { TYPE_LABEL } from '../lib/format.js';
import { writeStoreCode } from '../lib/store.js';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import Button from '../components/Button.jsx';
import ItemGrid from '../components/catalog/ItemGrid.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] sm:text-[44px]';
const TYPES = ['all', 'outfit', 'necklace', 'earrings', 'lipstick'];

function Shell({ children }) {
  return <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">{children}</section>;
}

/** /shop/:code: one retailer's store. Shoppers who start from here get looks made only from this retailer's items. */
export default function Store() {
  const { code } = useParams();
  const [state, setState] = useState({ phase: 'loading', data: null, error: null });
  const [type, setType] = useState('all');

  const load = useCallback(async () => {
    setState((s) => ({ ...s, phase: 'loading', error: null }));
    try { setState({ phase: 'ready', data: await api(`/api/catalog/store/${encodeURIComponent(code)}`), error: null }); }
    catch (error) { setState({ phase: 'error', data: null, error }); }
  }, [code]);
  useEffect(() => { load(); }, [load]);

  const items = state.data?.items;
  const shown = useMemo(() => (items ?? []).filter((i) => type === 'all' || i.type === type), [items, type]);

  if (state.phase === 'loading') return <Shell><LoadingBlock label="Opening the store…" cards={3} /></Shell>;
  if (state.phase === 'error') {
    return (
      <Shell>
        <h1 className={H1}>{state.error?.status === 404 ? 'We could not find this store' : 'We could not open this store'}</h1>
        <ErrorNote error={state.error} className="mt-6 max-w-xl" />
        <div className="mt-8 flex flex-wrap gap-3"><Button onClick={load}>Try again</Button><Button to="/catalog" variant="secondary">Browse every retailer</Button></div>
      </Shell>
    );
  }

  const { store } = state.data;
  return (
    <Shell>
      <h1 className={H1}>{store.name}</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">Upload a selfie and a full-length photo and we will plan complete looks from {store.name}&rsquo;s items only. No account needed.</p>
      <p className="mt-3 text-[15px] text-ink-soft">{store.itemCount} items: {store.counts.outfit} outfits, {store.counts.necklace} necklaces, {store.counts.earrings} earrings, {store.counts.lipstick} lipsticks.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button to="/start" onClick={() => writeStoreCode(store.code)}>Find my looks from {store.name}</Button>
        <Link to="/catalog" onClick={() => writeStoreCode(null)} className="inline-flex min-h-11 items-center text-[15px] text-rani underline underline-offset-4">Or shop every retailer</Link>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by item type">
        {TYPES.map((t) => (
          <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] transition-colors ${type === t ? 'border-rani bg-rani-wash text-rani-deep' : 'border-line bg-paper hover:border-ink'}`}>
            {t === 'all' ? 'All items' : `${TYPE_LABEL[t]}s`.replace('Earringss', 'Earrings')}
          </button>
        ))}
      </div>
      <div className="mt-8"><ItemGrid items={shown} /></div>
    </Shell>
  );
}
