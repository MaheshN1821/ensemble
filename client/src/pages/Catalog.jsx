import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { TYPE_LABEL, GENDER_LABEL, OUTFIT_CATEGORY_LABEL, rupees } from '../lib/format.js';
import { cleanPicks, pickedIds, readPicks, removePick, togglePick, totalOf, writePicks } from '../lib/build.js';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import Button from '../components/Button.jsx';
import ItemGrid from '../components/catalog/ItemGrid.jsx';
import TryOnBar from '../components/catalog/TryOnBar.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] sm:text-[44px]';
const TYPES = ['all', 'outfit', 'earrings', 'lipstick', 'blush', 'foundation', 'eyewear', 'watch'];
const GENDERS = ['all', 'women', 'men', 'unisex'];
const CATEGORIES = ['all', 'casual', 'party', 'saree', 'formal', 'festive'];

function Shell({ children, hasPicks }) {
  return (
    <section className={`mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16 ${hasPicks ? 'pb-36 sm:pb-44' : ''}`}>
      {children}
    </section>
  );
}

/** The shared catalog: everything every retailer has uploaded, open to everyone. Shoppers plan their looks from these items. */
export default function Catalog() {
  const [state, setState] = useState({ phase: 'loading', data: null, error: null });
  const [type, setType] = useState('all');
  const [gender, setGender] = useState('all');
  const [category, setCategory] = useState('all');
  const [seller, setSeller] = useState('all');
  const [picks, setPicks] = useState({});

  const load = useCallback(async () => {
    setState((s) => ({ ...s, phase: 'loading', error: null }));
    try {
      const data = await api('/api/catalog');
      setState({ phase: 'ready', data, error: null });
      // Initialize picks from shared build storage, cleaning against the loaded items
      const savedIds = readPicks();
      setPicks(cleanPicks(savedIds, data.items ?? []));
    } catch (error) {
      setState({ phase: 'error', data: null, error });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const items = state.data?.items;
  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);
  const shown = useMemo(
    () => (items ?? []).filter((i) => {
      if (type !== 'all' && i.type !== type) return false;
      const itemGender = i.gender || 'unisex';
      if (gender !== 'all' && itemGender !== gender && itemGender !== 'unisex') return false;
      const itemCategory = i.category?.toLowerCase() || (i.silhouette === 'saree' ? 'saree' : null);
      if (type === 'outfit' && category !== 'all' && itemCategory !== category) return false;
      if (seller !== 'all' && i.seller !== seller) return false;
      return true;
    }),
    [items, type, gender, category, seller],
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

  if (state.phase === 'loading') return <Shell><LoadingBlock label="Loading the catalog…" cards={3} /></Shell>;
  if (state.phase === 'error') {
    return (
      <Shell>
        <h1 className={H1}>We could not load the catalog</h1>
        <ErrorNote error={state.error} className="mt-6 max-w-xl" />
        <div className="mt-8 flex gap-3"><Button onClick={load}>Try again</Button></div>
      </Shell>
    );
  }

  const { catalog } = state.data;
  const pickedList = pickedIds(picks);
  const pickedCount = pickedList.length;
  const total = totalOf(picks, byId);

  return (
    <Shell hasPicks={pickedCount > 0}>
      <h1 className={H1}>{catalog.name}</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">
        Every outfit, pair of earrings and lipstick from every retailer on Ensemble. Select items to see the whole look drawn on your own photos, or plan looks with our styling studio. No account needed.
      </p>
      <p className="mt-3 text-[15px] text-ink-soft">
        {catalog.itemCount} items: {catalog.counts.outfit} outfits, {catalog.counts.earrings} earrings, {catalog.counts.lipstick} lipsticks.
      </p>

      {/* Virtual try-on shortcut banner */}
      <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-rani-wash text-[14px] text-rani font-medium" aria-hidden="true">
            ✨
          </span>
          <p className="text-[14px] sm:text-[15px] text-ink-soft">
            {pickedCount > 0 ? (
              <span>
                <strong className="font-medium text-ink">{pickedCount} {pickedCount === 1 ? 'piece' : 'pieces'}</strong> selected for virtual try-on ({rupees(total)}).
              </span>
            ) : (
              <span>
                Select any outfit and accessories below to preview virtual try-on, or build a custom look in the studio.
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to={pickedCount > 0 ? `/build?items=${pickedList.join(',')}` : '/build'}
            className="text-[14px] font-medium text-rani underline underline-offset-4 hover:text-rani-deep"
          >
            {pickedCount > 0 ? 'Open in look builder →' : 'Build your own look →'}
          </Link>
        </div>
      </div>

      {/* Type filter row */}
      <div className="mt-8 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by item type">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => { setType(t); setCategory('all'); }}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] transition-colors ${type === t ? 'border-rani bg-rani-wash text-rani-deep' : 'border-line bg-paper hover:border-ink'
              }`}
          >
            <span>{t === 'all' ? 'All items' : (TYPE_LABEL[t] ? `${TYPE_LABEL[t]}s`.replace('Eyewears', 'Eyewear').replace('Watchs', 'Watches').replace('Earringss', 'Earrings') : t)}</span>
            {t !== 'all' && picks[t] && (
              <span className="text-peacock font-medium" aria-label="Chosen for try-on" title="Chosen for try-on">✓</span>
            )}
          </button>
        ))}
        {catalog.sellers.length > 1 && (
          <label className="ml-auto flex items-center gap-2 text-[14px] text-ink-soft">
            Sold by
            <select
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              className="h-11 max-w-[14rem] rounded-xl border border-line bg-paper px-3 text-[15px] text-ink"
            >
              <option value="all">Everyone</option>
              {catalog.sellers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Gender filter row */}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by gender">
        {GENDERS.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={gender === g}
            onClick={() => setGender(g)}
            className={`inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] transition-colors ${gender === g ? 'border-rani bg-rani-wash text-rani-deep' : 'border-line bg-paper text-ink-soft hover:border-ink hover:text-ink'
              }`}
          >
            {GENDER_LABEL[g]}
          </button>
        ))}
      </div>

      {/* Outfit category filter row — only shown when type is outfit */}
      {type === 'outfit' && (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter by outfit category">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] transition-colors ${category === c ? 'border-zari bg-zari-wash text-ink' : 'border-line bg-paper text-ink-soft hover:border-ink hover:text-ink'
                }`}
            >
              {OUTFIT_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        <ItemGrid items={shown} picks={picks} onTogglePick={handleTogglePick} />
      </div>

      <p className="mt-10 text-[14px] text-ink-soft">
        Prices are in rupees. Items link out to the retailer’s own page; there is no checkout here. Are you a retailer?{' '}
        <Link to="/retailer" className="text-rani underline underline-offset-4">Add your items</Link>.
      </p>

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
