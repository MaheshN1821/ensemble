import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { TYPE_LABEL } from '../../lib/format.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useRetailerDashboard } from '../../hooks/useRetailerData.js';
import Button from '../Button.jsx';
import AccountSettings from '../auth/AccountSettings.jsx';
import LoadingBlock from '../ui/LoadingBlock.jsx';
import ItemGrid from '../catalog/ItemGrid.jsx';
import ImportForm from '../catalog/ImportForm.jsx';
import ImportReport from '../catalog/ImportReport.jsx';
import RetailerUsage from './RetailerUsage.jsx';
import { ErrorNote } from '../intake/fields.jsx';

const API = import.meta.env.VITE_API_URL || '';
const TYPES = ['all', 'outfit', 'earrings', 'lipstick', 'blush', 'foundation', 'eyewear', 'watch'];
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const COLUMNS = [
  ['type', 'outfit, earrings, lipstick, blush, foundation, eyewear or watch'],
  ['gender', 'all, women, men or unisex'],
  ['category', 'for outfits: casual, party, saree, formal or festive'],
  ['name, price', 'price in whole rupees'],
  ['image_url', 'a public https link to a .jpg or .png. A plain background works best'],
  ['formality', '1 (casual) to 5 (very formal). Optional for makeup'],
  ['occasion_tags', 'for example wedding-guest|festive|office|party'],
  ['metal_tone', 'earrings and watches: gold, silver, rose gold or oxidised'],
  ['colours', 'hex codes (#DE6B7E, #D59B6A) or names. Crucial for makeup virtual try-on'],
];

function Panel({ id, title, children, intro }) {
  return (
    <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6" aria-labelledby={id}>
      <h2 id={id} className="text-[20px] font-medium tracking-[-0.02em]">{title}</h2>
      {intro && <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-ink-soft">{intro}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StoreLink({ code }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const url = `${window.location.origin}/shop/${code}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt('Copy your store link', url); }
  };
  return (
    <Panel id="store-title" title="Your store link" intro="Share this link with your customers (on Instagram, WhatsApp or your website). Shoppers who start from it get looks made only from your items. Everyone else still sees your items mixed with other retailers' in the main catalog.">
      <div className="flex flex-wrap items-center gap-3">
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Your store link" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 font-mono text-[14px]" />
        <Button className="h-11 px-4 text-sm" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>
        <Button to={`/shop/${code}`} variant="secondary" className="h-11 px-4 text-sm">Open my store</Button>
      </div>
    </Panel>
  );
}

function Stat({ label, value }) {
  return <div className="bg-paper px-4 py-4"><dt className="text-[13px] text-ink-soft">{label}</dt><dd className="mt-1 text-[28px] font-light leading-none tabular-nums">{value}</dd></div>;
}

function UploadRow({ upload, token, onDelete, busy, onProblems }) {
  const t = upload.totals ?? {};
  const rejected = upload.status === 'rejected';
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-[16px] font-medium">{upload.fileName || 'Untitled file'}</p>
        <p className="mt-0.5 text-[14px] text-ink-soft">{when(upload.createdAt)}{upload.mode === 'replace' ? ' · replaced catalog' : ''}</p>
        <p className="mt-1 text-[14px]">
          {rejected ? <span className="text-alert">✕ Nothing was imported</span> : <>✓ {plural(t.imported ?? 0, 'item', 'items')} added{t.updated ? `, ${t.updated} updated` : ''}{t.removed ? `, ${t.removed} removed` : ''}</>}
          {t.rejected ? <span className="text-ink-soft"> · {plural(t.rejected, 'row', 'rows')} not imported</span> : null}
        </p>
        {!rejected && <p className="mt-0.5 text-[14px] text-ink-soft">{plural(upload.itemsNow, 'item', 'items')} from this upload in the catalog now</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1">
        {upload.problemCount > 0 && <button type="button" onClick={() => onProblems(upload)} className="inline-flex min-h-11 items-center text-[14px] text-rani underline underline-offset-4">See what to fix</button>}
        {upload.itemsNow > 0 && <button type="button" disabled={busy} onClick={() => onDelete(upload)} className="inline-flex min-h-11 items-center text-[14px] text-alert underline underline-offset-4 disabled:opacity-50">Delete these items</button>}
        {rejected && <button type="button" disabled={busy} onClick={() => onDelete(upload)} className="inline-flex min-h-11 items-center text-[14px] text-ink-soft underline underline-offset-4 disabled:opacity-50">Remove from history</button>}
      </div>
    </li>
  );
}

/** The signed-in retailer's space: everything they uploaded, kept on the server, with upload, delete, usage and account tools. */
export default function RetailerDashboard() {
  const { retailer, signOut, forget } = useAuth();
  const token = retailer.token;
  const { phase, data, error, apply, reload } = useRetailerDashboard(token, { onSignedOut: () => forget('retailer') });
  const [report, setReport] = useState(null);
  const [type, setType] = useState('all');
  const [uploadFilter, setUploadFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [usageTick, setUsageTick] = useState(0);

  const items = data?.items ?? [];
  const [gender, setGender] = useState('all');
  const [category, setCategory] = useState('all');
  const shown = useMemo(() => items.filter((i) => {
    if (type !== 'all' && i.type !== type) return false;
    if (gender !== 'all' && i.gender && i.gender !== gender && i.gender !== 'unisex') return false;
    if (type === 'outfit' && category !== 'all' && i.category !== category) return false;
    if (uploadFilter !== 'all' && i.uploadId !== uploadFilter) return false;
    return true;
  }), [items, type, gender, category, uploadFilter]);

  if (phase === 'loading' && !data) return <div className="mt-10"><LoadingBlock label="Loading your catalog…" cards={3} /></div>;
  if (!data) {
    return <div className="mt-10 max-w-xl"><ErrorNote error={error} /><div className="mt-6"><Button onClick={reload}>Try again</Button></div></div>;
  }
  const { summary, uploads } = data;
  const account = retailer.account ?? data.account;

  const run = async (fn) => {
    setBusy(true); setActionError(null);
    try { const next = await fn(); apply(next); setUsageTick((n) => n + 1); }
    catch (e) { setActionError(e); } finally { setBusy(false); }
  };
  const removeItem = (item) => {
    if (!window.confirm(`Delete “${item.name}”? It is removed from the catalog, from shoppers’ options and from image storage. This cannot be undone.`)) return;
    return run(() => api(`/api/retailer/items/${encodeURIComponent(item.id)}`, { method: 'DELETE', authToken: token }));
  };
  const removeUpload = (u) => {
    const msg = u.itemsNow > 0
      ? `Delete the ${plural(u.itemsNow, 'item', 'items')} from “${u.fileName || 'this upload'}”? They are removed from the catalog and image storage. This cannot be undone.`
      : 'Remove this upload from your history?';
    if (!window.confirm(msg)) return;
    return run(() => api(`/api/retailer/uploads/${encodeURIComponent(u.id)}`, { method: 'DELETE', authToken: token }));
  };
  const showProblems = async (u) => {
    setActionError(null);
    try { setReport((await api(`/api/retailer/uploads/${encodeURIComponent(u.id)}/report`, { authToken: token })).report); document.getElementById('report-anchor')?.scrollIntoView({ behavior: 'smooth' }); }
    catch (e) { setActionError(e); }
  };

  return (
    <div className="mt-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <div className="min-w-0">
          <p className="text-[14px] text-ink-soft">Signed in as {account.email}</p>
          <p className="mt-0.5 truncate text-[22px] font-medium tracking-[-0.02em]">{account.retailer.businessName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button to="/catalog" variant="secondary" className="h-11 px-4 text-sm">See what shoppers see</Button>
          <Button variant="secondary" className="h-11 px-4 text-sm" onClick={() => signOut('retailer')}>Sign out</Button>
        </div>
      </div>

      <StoreLink code={data.store?.code ?? account.retailer.code} />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-5">
        <Stat label="Items live" value={summary.items} />
        <Stat label="Outfits" value={summary.counts.outfit} />
        <Stat label="Earrings" value={summary.counts.earrings} />
        <Stat label="Lipsticks" value={summary.counts.lipstick} />
        <Stat label="Other" value={(summary.counts.eyewear ?? 0) + (summary.counts.watch ?? 0)} />
      </dl>

      <Panel id="add-title" title="Add items" intro={`Every valid item goes live for shoppers at once and stays here until you delete it. You can have up to ${summary.limit} items.`}>
        <div className="mb-5 flex flex-wrap gap-3">
          <Button href={`${API}/api/catalog/template`} variant="secondary" className="h-11 px-4 text-sm">Download CSV template</Button>
          <Button href={`${API}/api/catalog/template?format=json`} variant="secondary" className="h-11 px-4 text-sm">Download JSON template</Button>
        </div>
        <details className="mb-5 border-y border-line py-4">
          <summary className="cursor-pointer text-[15px] text-ink-soft hover:text-ink">What goes in each column</summary>
          <dl className="mt-4 space-y-2 text-[15px]">{COLUMNS.map(([k, v]) => <div key={k} className="grid gap-1 sm:grid-cols-[10rem_1fr]"><dt className="font-mono text-[13px]">{k}</dt><dd className="text-ink-soft">{v}</dd></div>)}</dl>
        </details>
        {/* <div className="mb-5 rounded-xl border border-rani/20 bg-rani-wash/30 p-4 text-[14px]">
          <h3 className="font-semibold text-rani-deep flex items-center gap-1.5">
            <span>✨</span> Guidelines for Adding Makeup Products (Lipstick, Blush, Foundation)
          </h3>
          <p className="mt-1 text-ink-soft">
            To ensure YouCam AI Virtual Try-On renders accurately on shopper photos:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1 text-ink-soft">
            <li><strong className="text-ink">Type:</strong> Use <code className="bg-paper px-1 rounded">lipstick</code>, <code className="bg-paper px-1 rounded">blush</code>, or <code className="bg-paper px-1 rounded">foundation</code>.</li>
            <li><strong className="text-ink">Colours (Crucial):</strong> Provide the shade as a hex code (e.g. <code className="bg-paper px-1 rounded">#DE6B7E</code> for blush, <code className="bg-paper px-1 rounded">#D59B6A</code> for foundation, <code className="bg-paper px-1 rounded">#A03F2E</code> for lipstick) or color name. The AI applies this exact pigment to the shopper's face.</li>
            <li><strong className="text-ink">Product URL:</strong> Include your store or checkout link so shoppers can buy the product directly.</li>
            <li><strong className="text-ink">Image URL:</strong> A direct HTTPS link to a clear product photo or swatch.</li>
          </ul>
        </div> */}
        <ImportForm token={token} hasItems={summary.items > 0} onReport={setReport} onDone={(out) => { apply(out); setUsageTick((n) => n + 1); }} />
      </Panel>

      <div id="report-anchor">{report && <ImportReport report={report} />}</div>
      <ErrorNote error={actionError} />

      <Panel id="uploads-title" title={`Your uploads (${uploads.length})`} intro="Every file you have sent, newest first.">
        {uploads.length === 0 ? <p className="text-[15px] text-ink-soft">Nothing uploaded yet. Add a file above and it will be listed here.</p> : (
          <ul className="divide-y divide-line border-y border-line">
            {uploads.map((u) => <UploadRow key={u.id} upload={u} token={token} busy={busy} onDelete={removeUpload} onProblems={showProblems} />)}
          </ul>
        )}
      </Panel>

      <section aria-labelledby="items-title">
        <h2 id="items-title" className="text-[20px] font-medium tracking-[-0.02em]">Your items ({summary.items})</h2>
        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by item type">
          {TYPES.map((t) => (
            <button key={t} type="button" aria-pressed={type === t}
              onClick={() => { setType(t); setCategory('all'); }}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] transition-colors ${type === t ? 'border-rani bg-rani-wash text-rani-deep' : 'border-line bg-paper hover:border-ink'}`}>
              {t === 'all' ? 'All' : (TYPE_LABEL[t] ? `${TYPE_LABEL[t]}s`.replace('Eyewears', 'Eyewear').replace('Watchs', 'Watches').replace('Earringss', 'Earrings') : t)}
            </button>
          ))}
          {uploads.length > 1 && (
            <label className="ml-auto flex items-center gap-2 text-[14px] text-ink-soft">From
              <select value={uploadFilter} onChange={(e) => setUploadFilter(e.target.value)} className="h-11 max-w-[14rem] rounded-xl border border-line bg-paper px-3 text-[15px] text-ink">
                <option value="all">All uploads</option>
                {uploads.filter((u) => u.itemsNow > 0).map((u) => <option key={u.id} value={u.id}>{u.fileName || 'Untitled'} · {when(u.createdAt)}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter by gender">
          {['all', 'women', 'men', 'unisex'].map((g) => (
            <button key={g} type="button" aria-pressed={gender === g} onClick={() => setGender(g)}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] transition-colors ${gender === g ? 'border-rani bg-rani-wash text-rani-deep' : 'border-line bg-paper text-ink-soft hover:border-ink hover:text-ink'}`}>
              {g === 'all' ? 'All genders' : g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        {type === 'outfit' && (
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter by outfit category">
            {['all', 'casual', 'party', 'saree', 'formal', 'festive'].map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}
                className={`inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] transition-colors ${category === c ? 'border-zari bg-zari-wash text-ink' : 'border-line bg-paper text-ink-soft hover:border-ink hover:text-ink'}`}>
                {c === 'all' ? 'All categories' : c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        )}
        <div className="mt-5"><ItemGrid items={shown} onRemove={removeItem} busy={busy} empty={summary.items === 0 ? 'You have no items yet. Upload a file above.' : 'No items match this filter.'} /></div>
      </section>

      {summary.items > 0 && <RetailerUsage token={token} refreshKey={usageTick} />}
      <Panel id="acct-title" title="Account">
        <dl className="mb-8 grid gap-x-8 gap-y-2 text-[15px] sm:grid-cols-2">
          <div><dt className="text-ink-soft">Shop</dt><dd>{account.retailer.businessName}</dd></div>
          <div><dt className="text-ink-soft">Email</dt><dd>{account.email}</dd></div>
          <div><dt className="text-ink-soft">Phone</dt><dd>{account.retailer.phone}</dd></div>
          <div><dt className="text-ink-soft">City</dt><dd>{account.retailer.city}</dd></div>
        </dl>
        <AccountSettings token={token} deleteLabel="Delete my account and all my items" deleteWarning="This deletes your account, every item and image, and your upload history. Shoppers will no longer see your items." onGone={() => forget('retailer')} />
      </Panel>
      <p className="text-[14px] text-ink-soft">Shoppers can also browse everything on the <Link to="/catalog" className="text-rani underline underline-offset-4">catalog page</Link>. Items link out to your own product pages; there is no checkout here.</p>
    </div>
  );
}
