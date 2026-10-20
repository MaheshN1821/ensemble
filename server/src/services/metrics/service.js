import { REFINEMENT_LABELS, SAMPLE_STATS_ID, STATS_NOTE, TOP_ITEMS_SHOWN, decodeKey, encodeKey } from '../../config/metrics.js';

const SLOTS = ['outfit', 'necklace', 'earrings', 'lipstick'];

/** The catalog a session plans from. A session with no catalog uses the sample catalog. */
export const catalogIdOf = (session) => session?.catalogId || SAMPLE_STATS_ID;

const csvCell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  // Spreadsheet formula injection: item names come from retailers, so a leading = + - @ is made harmless.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Aggregate counters for the retailer view (FR-29, FR-30).
 *
 * Every `record*` method is fire-and-forget: a counter failure is logged and never reaches the shopper.
 * Per-session once-only events (a session counted once, "nothing within budget" counted once) are guarded by
 * `sessions.markOnce`, an atomic flag on the session document. The flags die with the session; the counters hold numbers only.
 */
export function createMetrics({ store, sessions, logger }) {
  const log = logger ?? { warn() {}, info() {} };
  const safe = (label, fn) => Promise.resolve().then(fn).catch((err) => log.warn({ err: err?.message, label }, 'metrics update failed'));

  const once = async (sessionId, flag) => (sessions?.markOnce ? sessions.markOnce(sessionId, flag) : false);

  return {
    /** A plan was made for this session on this catalog. Counts the session once, and "nothing within budget" once. */
    planned(session, plan) {
      return safe('planned', async () => {
        const cid = catalogIdOf(session);
        const incs = {};
        if (await once(session._id, `sess:${cid}`)) incs.sessions = 1;
        if (plan?.status === 'over_budget' && (await once(session._id, `nobudget:${cid}`))) incs.nothingWithinBudget = 1;
        await store.inc(cid, incs);
      });
    },

    /** A new look was chosen to be drawn. Counts the look and each item in it. */
    lookStarted(session, items) {
      return safe('lookStarted', async () => {
        const incs = { looksGenerated: 1 };
        for (const slot of SLOTS) if (items?.[slot]?.id) incs[`itemPicks.${encodeKey(items[slot].id)}`] = 1;
        await store.inc(catalogIdOf(session), incs);
      });
    },

    /** A stage drew successfully and cost units. `firstForLook` marks the first paid stage of a look. */
    unitsSpent(session, { units, firstForLook }) {
      return safe('unitsSpent', async () => {
        const incs = {};
        if (units > 0) incs.units = units;
        if (firstForLook && units > 0) incs.looksDrawn = 1;
        await store.inc(catalogIdOf(session), incs);
      });
    },

    /** A refinement turn changed something (or asked for something the catalog cannot do). `ops` are operation names. */
    refined(session, ops) {
      return safe('refined', async () => {
        const incs = {};
        for (const op of new Set(ops ?? [])) incs[`refinements.${Object.hasOwn(REFINEMENT_LABELS, op) ? op : 'other'}`] = 1;
        await store.inc(catalogIdOf(session), incs);
      });
    },

    /** Removes a catalog's counters (the retailer deleted the catalog, or it expired). */
    deleteCatalog(catalogId) {
      return safe('deleteCatalog', () => store.delete(catalogId));
    },

    /**
     * The retailer view for one catalog. `items` are the catalog's current items, so ids can be shown as names.
     * An item picked earlier and since removed is still listed, by its id.
     */
    async report(catalog, items = []) {
      const doc = (await store.get(catalog.id)) ?? {};
      const n = (v) => (Number.isFinite(v) ? v : 0);
      const totals = {
        sessions: n(doc.sessions),
        looksGenerated: n(doc.looksGenerated),
        looksDrawn: n(doc.looksDrawn),
        nothingWithinBudget: n(doc.nothingWithinBudget),
        units: n(doc.units),
      };
      totals.avgUnitsPerLook = totals.looksDrawn > 0 ? Math.round((totals.units / totals.looksDrawn) * 10) / 10 : null;

      const byId = new Map(items.map((i) => [i.id, i]));
      const topItems = Object.entries(doc.itemPicks ?? {})
        .map(([key, picks]) => {
          const id = decodeKey(key);
          const it = byId.get(id);
          return { id, name: it?.name ?? id, type: it?.type ?? null, price: it?.price ?? null, picks: n(picks), inCatalog: Boolean(it) };
        })
        .filter((r) => r.picks > 0)
        .sort((a, b) => b.picks - a.picks || a.id.localeCompare(b.id))
        .slice(0, TOP_ITEMS_SHOWN);

      const refinements = Object.entries(doc.refinements ?? {})
        .map(([op, count]) => ({ op, label: REFINEMENT_LABELS[op] ?? REFINEMENT_LABELS.other, count: n(count) }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count || a.op.localeCompare(b.op));

      return {
        catalog: { id: catalog.id, name: catalog.name, source: catalog.source },
        empty: totals.sessions === 0 && totals.looksGenerated === 0,
        since: doc.since ?? null,
        updatedAt: doc.updatedAt ?? null,
        totals,
        topItems,
        refinements,
        note: STATS_NOTE,
      };
    },

    /** The same report as CSV (metric, key, label, value). One flat table opens anywhere. */
    toCsv(report) {
      const rows = [['section', 'key', 'label', 'value']];
      const t = report.totals;
      rows.push(['total', 'sessions', 'Sessions that planned a look', t.sessions]);
      rows.push(['total', 'looks_generated', 'Looks generated', t.looksGenerated]);
      rows.push(['total', 'looks_drawn', 'Looks that used units', t.looksDrawn]);
      rows.push(['total', 'units', 'Units spent drawing looks', t.units]);
      rows.push(['total', 'avg_units_per_look', 'Average units per drawn look', t.avgUnitsPerLook ?? '']);
      rows.push(['total', 'nothing_within_budget', 'Sessions with nothing within budget', t.nothingWithinBudget]);
      for (const r of report.topItems) rows.push(['item_picks', r.id, r.name, r.picks]);
      for (const r of report.refinements) rows.push(['refinements', r.op, r.label, r.count]);
      rows.push(['meta', 'catalog', report.catalog.name, report.catalog.id]);
      rows.push(['meta', 'counting_since', '', report.since ? new Date(report.since).toISOString() : '']);
      rows.push(['meta', 'exported_at', '', new Date().toISOString()]);
      return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
    },
  };
}
