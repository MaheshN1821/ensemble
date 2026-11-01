import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { TYPE_LABEL, rupees } from '../lib/format.js';
import { writeStoreCode } from '../lib/store.js';
import { cleanPicks, pickedIds, readPicks, removePick, togglePick, totalOf, writePicks } from '../lib/build.js';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import Button from '../components/Button.jsx';
import ItemGrid from '../components/catalog/ItemGrid.jsx';
import TryOnBar from '../components/catalog/TryOnBar.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] sm:text-[44px]';
const TYPES = ['all', 'outfit', 'earrings', 'lipstick', 'eyewear', 'watch'];
const GENDERS = ['all', 'women', 'men', 'unisex'];
const CATEGORIES = ['all', 'casual', 'party', 'saree', 'formal', 'festive'];

function Shell({ children, hasPicks }) {
  return (
    <section className={`mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16 ${hasPicks ? 'pb-36 sm:pb-44' : ''}`}>
      {children}
    </section>
  );
}

/** /shop/:code: one retailer's store. Shoppers who start from here get looks made only from this retailer's items. */
export default function Store() {
  const { code } = useParams();
  const [state, setState] = useState({ phase: 'loading', data: null, error: null });
  const [type, setType] = useState('all');
  const [gender, setGender] = useState('all');
  const [category, setCategory] = useState('all');
  const [picks, setPicks] = useState({});

  const load = useCallback(async () => {
    setState((s) => ({ ...s, phase: 'loading', error: null }));
    try {
      const data = await api(`/api/catalog/store/${encodeURIComponent(code)}`);
      setState({ phase: 'ready', data, error: null });
      const savedIds = readPicks();
      setPicks(cleanPicks(savedIds, data.items ?? []));
    } catch (error) {
      setState({ phase: 'error', data: null, error });
    }
  }, [code]);
  useEffect(() => { load(); }, [load]);

  const items = state.data?.items;
  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const shown = useMemo(
    () => (items ?? []).filter((i) => {
      if (type !== 'all' && i.type !== type) return false;
      if (gender !== 'all' && i.gender && i.gender !== gender && i.gender !== 'unisex') return false;
      if (type === 'outfit' && category !== 'all' && i.category !== category) return false;
      return true;
    }),
    [items, type, gender, category],
  );

  const handleTogglePick = useCallback((item) => {
    setPicks((prev) => {
      const next = togglePick(prev, item);
      writePicks(next);
      return next;
    });
  }, []);

  const handleRemovePick = useCallback((slot) => {
    setPicks((prev) => {
      const next = removePick(prev, slot);
      writePicks(next);
      return next;
    });
  }, []);

  const handleClearPicks = useCallback(() => {
    setPicks({});
    writePicks({});
  }, []);

  const handleSlotClick = useCallback((slot) => {
    setType(slot);
    setGender('all');
    setCategory('all');
    window.scrollTo({ top: 220, behavior: 'smooth' });
  }, []);

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
  const pickedList = pickedIds(picks);
  const pickedCount = pickedList.length;

  return (
    <Shell hasPicks={pickedCount > 0}>
      <h1 className={H1}>{store.name}</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">
        Select pieces below for virtual try-on, or upload a selfie and full-length photo to plan complete looks from {store.name}&rsquo;s items only. No account needed.
      </p>
      <p className="mt-3 text-[15px] text-ink-soft">{store.itemCount} items: {store.counts.outfit} outfits, {store.counts.earrings} earrings, {store.counts.lipstick} lipsticks.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button to="/start" onClick={() => writeStoreCode(store.code)}>Find my looks from {store.name}</Button>
        <Link to="/catalog" onClick={() => writeStoreCode(null)} className="inline-flex min-h-11 items-center text-[15px] text-rani underline underline-offset-4">Or shop every retailer</Link>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by item type">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => { setType(t); setCategory('all'); }}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] transition-colors ${
              type === t ? 'border-rani bg-rani-wash text-rani-deep' : 'border-line bg-paper hover:border-ink'
            }`}
          >
            <span>{t === 'all' ? 'All items' : (TYPE_LABEL[t] ? `${TYPE_LABEL[t]}s`.replace('Eyewears', 'Eyewear').replace('Watchs', 'Watches').replace('Earringss', 'Earrings') : t)}</span>
            {t !== 'all' && picks[t] && (
              <span className="text-peacock font-medium" aria-label="Chosen for try-on" title="Chosen for try-on">✓</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by gender">
        {GENDERS.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={gender === g}
            onClick={() => setGender(g)}
            className={`inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] transition-colors ${
              gender === g ? 'border-rani bg-rani-wash text-rani-deep' : 'border-line bg-paper text-ink-soft hover:border-ink hover:text-ink'
            }`}
          >
            {g === 'all' ? 'All' : g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>

      {type === 'outfit' && (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter by outfit category">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] transition-colors ${
                category === c ? 'border-zari bg-zari-wash text-ink' : 'border-line bg-paper text-ink-soft hover:border-ink hover:text-ink'
              }`}
            >
              {c === 'all' ? 'All Outfits' : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8">
        <ItemGrid items={shown} picks={picks} onTogglePick={handleTogglePick} />
      </div>

      {/* Floating Try-On Bar */}
      <TryOnBar
        picks={picks}
        byId={byId}
        onRemove={handleRemovePick}
        onClear={handleClearPicks}
        onSlotClick={handleSlotClick}
      />
    </Shell>
  );
}
