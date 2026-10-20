import { useState } from 'react';
import { apiDownload } from '../../lib/api.js';
import { rupees, TYPE_LABEL } from '../../lib/format.js';
import { useUsage } from '../../hooks/useUsage.js';
import Button from '../Button.jsx';
import LoadingBlock from '../ui/LoadingBlock.jsx';
import { ErrorNote } from '../intake/fields.jsx';

const nf = new Intl.NumberFormat('en-IN');
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : null);
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

/** A ranked list with a plain count beside each bar, so the number never depends on the bar or its colour. */
function Ranked({ title, rows, empty }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section aria-label={title}>
      <h3 className="text-[16px] font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-soft">{empty}</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-4 text-[15px]">
                <span className="min-w-0">
                  <span className="break-words">{r.label}</span>
                  {r.sub && <span className="ml-2 text-[13px] text-ink-soft">{r.sub}</span>}
                </span>
                <span className="shrink-0 font-mono text-[14px] tabular-nums">{nf.format(r.count)}</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-line" aria-hidden="true">
                <div className="h-full rounded-full bg-ink/70" style={{ width: `${Math.max(4, Math.round((r.count / max) * 100))}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * The retailer view (FR-29, FR-30): anonymous counts from real sessions on one catalog, and a CSV export.
 * `token` is the manage link's token. Without one it shows the public sample catalog's counts.
 */
export default function UsagePanel({ token }) {
  const { phase, data, error, reload } = useUsage(token);
  const [dl, setDl] = useState({ busy: false, error: null });
  const sample = !token;

  async function download() {
    setDl({ busy: true, error: null });
    try {
      await apiDownload(token ? '/api/catalogs/mine/stats.csv' : '/api/catalog/sample/stats.csv', { catalogToken: token, filename: 'ensemble-usage.csv' });
      setDl({ busy: false, error: null });
    } catch (e) { setDl({ busy: false, error: e }); }
  }

  const head = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="usage-title" className="text-[20px] font-medium tracking-[-0.02em]">{sample ? 'Live usage on the sample catalog' : 'How shoppers use your catalog'}</h2>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">
          {sample
            ? 'This is the retailer view, filled by real sessions on the sample catalog. A retailer sees the same numbers for their own catalog behind their private manage link.'
            : 'Anonymous counts from real shopper sessions on your catalog. They never include photos, skin readings, names or network addresses.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="h-11 px-4 text-sm" onClick={reload} disabled={phase === 'loading' || phase === 'refreshing'}>{phase === 'refreshing' ? 'Refreshing…' : 'Refresh'}</Button>
        <Button variant="secondary" className="h-11 px-4 text-sm" onClick={download} disabled={dl.busy || !data}>{dl.busy ? 'Preparing…' : 'Download CSV'}</Button>
      </div>
    </div>
  );

  let body;
  if (phase === 'loading' && !data) body = <LoadingBlock label="Counting…" className="mt-6" />;
  else if (phase === 'error' && !data) {
    body = (
      <div className="mt-6">
        <ErrorNote error={error} />
        <div className="mt-4"><Button onClick={reload}>Try again</Button></div>
      </div>
    );
  } else if (data.empty) {
    body = (
      <div className="mt-6 rounded-xl border border-dashed border-line bg-mist px-5 py-6" role="status">
        <p className="text-[17px] font-medium">No shopper sessions yet</p>
        <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-ink-soft">
          {sample
            ? 'Nobody has planned a look from the sample catalog yet. Plan one yourself and refresh: the numbers appear here within a moment.'
            : 'Numbers appear here after a shopper plans a look from your catalog. Send them your shopper link, then come back to this page and refresh.'}
        </p>
        <p className="mt-3 text-[14px] text-ink-soft">Nothing is estimated or made up. Until a real session happens, every count is zero.</p>
      </div>
    );
  } else {
    const { totals: t } = data;
    const items = data.topItems.map((i) => ({ key: i.id, label: i.name, sub: [i.type && TYPE_LABEL[i.type], i.price != null && rupees(i.price), !i.inCatalog && 'no longer in the catalog'].filter(Boolean).join(' · '), count: i.picks }));
    const changes = data.refinements.map((r) => ({ key: r.op, label: r.label, count: r.count }));
    body = (
      <>
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          <Figure label="Sessions" value={nf.format(t.sessions)} hint="Shoppers who planned a look" />
          <Figure label="Looks generated" value={nf.format(t.looksGenerated)} hint="Chosen and drawn on a shopper’s photos" />
          <Figure label="Units per look" value={t.avgUnitsPerLook == null ? '–' : t.avgUnitsPerLook} hint={t.avgUnitsPerLook == null ? 'No look has used units yet' : `Average of ${nf.format(t.looksDrawn)} drawn ${t.looksDrawn === 1 ? 'look' : 'looks'}`} />
          <Figure label="Nothing in budget" value={nf.format(t.nothingWithinBudget)} hint="Sessions where no look fit the budget" />
        </dl>
        {t.nothingWithinBudget > 0 && (
          <p className="mt-4 max-w-[64ch] rounded-lg bg-zari-wash px-4 py-3 text-[15px] leading-relaxed">
            In {nf.format(t.nothingWithinBudget)} of {nf.format(t.sessions)} {t.sessions === 1 ? 'session' : 'sessions'}, nothing in the catalog fit the shopper’s budget, so they saw only a closest match. Items at lower prices would reach these shoppers.
          </p>
        )}
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <Ranked title="Most chosen items" rows={items} empty="No items chosen yet." />
          <Ranked title="What shoppers change" rows={changes} empty="Nobody has refined a look yet." />
        </div>
      </>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6" aria-labelledby="usage-title">
      {head}
      <ErrorNote error={dl.error} className="mt-4" />
      {phase === 'error' && data && <ErrorNote error={error} className="mt-4" />}
      {body}
      {data && (
        <p className="mt-6 text-[13px] text-ink-soft">
          Counting since {dayOf(data.since) ?? 'the first session'}{data.updatedAt ? `. Last activity ${dayOf(data.updatedAt)}, ${timeOf(data.updatedAt)}.` : '.'} {data.note}
        </p>
      )}
    </section>
  );
}
