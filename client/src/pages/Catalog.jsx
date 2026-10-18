import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { TYPE_LABEL } from '../lib/format.js';
import { useCatalog } from '../hooks/useCatalog.js';
import { useSession } from '../hooks/useSession.js';
import Button from '../components/Button.jsx';
import ItemGrid from '../components/catalog/ItemGrid.jsx';
import ImportForm from '../components/catalog/ImportForm.jsx';
import ImportReport from '../components/catalog/ImportReport.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] sm:text-[44px]';
const TYPES = ['all', 'outfit', 'necklace', 'earrings', 'lipstick'];

function Shell({ children }) {
  return <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">{children}</section>;
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-[14px] text-ink-soft">{label}</p>
      <div className="mt-1 flex gap-2">
        <input readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 font-mono text-[13px]" />
        <Button
          variant="secondary"
          className="h-11 px-4 text-sm"
          onClick={async () => {
            try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the field is selectable as a fallback */ }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}

/** Shopper: use this catalog for my looks. Needs a session, which the hook starts. */
function UseCatalog({ token, name }) {
  const { session, error: sessionError } = useSession();
  const [state, setState] = useState({ busy: false, done: false, error: null });
  async function use() {
    setState({ busy: true, done: false, error: null });
    try {
      await api('/api/sessions/me/catalog', { method: 'PUT', body: { token }, sessionId: session.sessionId });
      setState({ busy: false, done: true, error: null });
    } catch (error) { setState({ busy: false, done: false, error }); }
  }
  return (
    <div className="mt-8 rounded-2xl border border-line bg-paper p-5 sm:p-6">
      <h2 className="text-[20px] font-medium tracking-[-0.02em]">Plan your look from {name}</h2>
      <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-ink-soft">Your outfit, jewellery and lipstick will be chosen only from the items below.</p>
      <ErrorNote error={state.error || sessionError} className="mt-4" />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {state.done ? (
          <>
            <p role="status" className="text-[15px] text-peacock">✓ This catalog is selected for your session.</p>
            <Button to="/start">Continue to my photos</Button>
          </>
        ) : (
          <Button onClick={use} disabled={!session || state.busy}>{state.busy ? 'Selecting…' : 'Use this catalog'}</Button>
        )}
      </div>
    </div>
  );
}

function OwnerPanel({ token, catalog, apply, links }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const shopperUrl = links?.share ? `${window.location.origin}/c/${links.share}` : null;

  async function remove() {
    if (!window.confirm(`Delete "${catalog.name}" and all of its items? This cannot be undone.`)) return;
    setDeleting(true); setError(null);
    try { await api('/api/catalogs/mine', { method: 'DELETE', catalogToken: token }); window.location.assign('/retailer'); }
    catch (e) { setError(e); setDeleting(false); }
  }

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6" aria-labelledby="links-title">
        <h2 id="links-title" className="text-[20px] font-medium tracking-[-0.02em]">Your links</h2>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">
          This page is your private manage link. Keep it safe: anyone who has it can change the catalog, and we cannot recover it.
          {shopperUrl ? ' Send the shopper link to your customers.' : ' The shopper link was shown once when you created the catalog.'}
        </p>
        <div className="mt-4 space-y-4">
          <CopyField label="Manage link (private)" value={window.location.href} />
          {shopperUrl && <CopyField label="Shopper link (share this)" value={shopperUrl} />}
        </div>
        <p className="mt-4 text-[14px] text-ink-soft">Catalogs are temporary: this one is removed on {new Date(catalog.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}. Importing or editing extends it.</p>
      </section>

      <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6" aria-labelledby="add-title">
        <h2 id="add-title" className="text-[20px] font-medium tracking-[-0.02em]">Add or replace items</h2>
        <p className="mb-5 mt-2 text-[15px] text-ink-soft">
          Need the format? <a className="text-rani underline underline-offset-4" href={`${import.meta.env.VITE_API_URL || ''}/api/catalog/template`}>Download the CSV template</a>.
        </p>
        <ImportForm token={token} submitLabel="Import file" onReport={setReport} onDone={apply} />
      </section>

      {report && <ImportReport report={report} />}
      <ErrorNote error={error} />
      <div><Button variant="quiet" className="text-alert" onClick={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete this catalog'}</Button></div>
    </div>
  );
}

export default function Catalog() {
  const { token } = useParams();
  const { phase, data, error, apply, reload } = useCatalog(token);
  const [type, setType] = useState('all');
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(null);
  // The shopper link is only known right after creation; Retailer.jsx passes it through router state in sessionStorage.
  const links = useMemo(() => { try { return JSON.parse(sessionStorage.getItem(`ensemble.links.${token}`)); } catch { return null; } }, [token]);

  if (phase === 'loading') return <Shell><p role="status" className="text-ink-soft">Loading the catalog…</p></Shell>;
  if (phase === 'error') {
    return (
      <Shell>
        <h1 className={H1}>{error.code === 'CATALOG_NOT_FOUND' ? 'We could not find that catalog' : 'We could not load the catalog'}</h1>
        <ErrorNote error={error} className="mt-6 max-w-xl" />
        <div className="mt-8 flex flex-wrap gap-3">
          {error.code === 'CATALOG_NOT_FOUND' ? <Button to="/catalog">See the sample catalog</Button> : <Button onClick={reload}>Try again</Button>}
          <Button to="/retailer" variant="secondary">Import a catalog</Button>
        </div>
      </Shell>
    );
  }

  const { catalog, items } = data;
  const owner = catalog.role === 'owner';
  const shown = type === 'all' ? items : items.filter((i) => i.type === type);

  async function removeItem(item) {
    setRemoving(true); setRemoveError(null);
    try { apply(await api(`/api/catalogs/mine/items/${encodeURIComponent(item.id)}`, { method: 'DELETE', catalogToken: token })); }
    catch (e) { setRemoveError(e); } finally { setRemoving(false); }
  }

  return (
    <Shell>
      <h1 className={H1}>{catalog.name}</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">
        {catalog.source === 'sample'
          ? 'The sample catalog that comes with Ensemble. Every item is invented, with its own illustration and no brand marks, and is labelled “Sample”.'
          : owner ? 'This is your catalog. Shoppers who open your shopper link plan their look from these items.' : 'A retailer’s catalog. Your look will be planned from these items.'}
      </p>
      <p className="mt-3 text-[15px] text-ink-soft">
        {catalog.itemCount} items: {catalog.counts.outfit} outfits, {catalog.counts.necklace} necklaces, {catalog.counts.earrings} earrings, {catalog.counts.lipstick} lipsticks.
      </p>

      {!owner && catalog.source === 'merchant' && <UseCatalog token={token} name={catalog.name} />}
      {owner && <OwnerPanel token={token} catalog={catalog} apply={apply} links={links} />}

      <div className="mt-10 flex flex-wrap gap-2" role="group" aria-label="Filter by item type">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] transition-colors ${type === t ? 'border-rani bg-rani-wash text-rani-deep' : 'border-line bg-paper hover:border-ink'}`}
          >
            {t === 'all' ? 'All items' : `${TYPE_LABEL[t]}s`.replace('Earringss', 'Earrings')}
          </button>
        ))}
      </div>
      <ErrorNote error={removeError} className="mt-4" />
      <div className="mt-6"><ItemGrid items={shown} onRemove={owner ? removeItem : undefined} busy={removing} /></div>
      <p className="mt-10 text-[14px] text-ink-soft">
        {catalog.source === 'sample' ? <>Are you a retailer? <Link to="/retailer" className="text-rani underline underline-offset-4">Import your own catalog</Link>.</> : 'Prices are in rupees. Items link out to the retailer’s own page; there is no checkout here.'}
      </p>
    </Shell>
  );
}
