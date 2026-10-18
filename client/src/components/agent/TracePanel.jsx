import { useMemo } from 'react';
import { useTrace } from '../../hooks/useAgent.js';

// A symbol and a word always go with the status, so colour never carries the meaning alone.
const MARK = { running: '…', queued: '…', ok: '✓', error: '!', no_result: '–', skipped: '–' };
const STATUS = { running: 'Running', queued: 'Waiting', ok: 'Done', error: 'Did not finish', no_result: 'No result', skipped: 'Skipped' };

const clock = (iso) => { try { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ''; } };
const took = (ms) => (ms == null ? null : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const unitsText = (n) => `${n} ${n === 1 ? 'unit' : 'units'}`;

/** Entries grouped by request, in the order they happened. A request is titled by what the person asked. */
export function groupTrace(entries) {
  const groups = [];
  const byTurn = new Map();
  for (const e of entries) {
    const key = e.turnId ?? 'other';
    let g = byTurn.get(key);
    if (!g) { g = { key, title: null, entries: [] }; byTurn.set(key, g); groups.push(g); }
    g.entries.push(e);
    if (e.tool === 'parse_intent' && !g.title) g.title = e.input;
  }
  for (const g of groups) g.title = g.title ? `Request: ${g.title}` : 'Other steps';
  return groups;
}

/** Only real YouCam charges count: the look-level line repeats its stages' units, so it is left out of the total. */
export const unitsSpent = (entries) => entries.filter((e) => e.tool.startsWith('youcam/') && e.status === 'ok').reduce((n, e) => n + (e.units ?? 0), 0);

function Step({ e }) {
  const live = e.status === 'running' || e.status === 'queued';
  const t = live ? null : took(e.durationMs);
  return (
    <li className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[4.75rem_minmax(0,1fr)_auto]">
      <span className="text-white/70">{clock(e.startedAt)}</span>
      <span className="min-w-0">
        <span className="font-medium text-white">
          <span aria-hidden="true" className={`mr-2 inline-block w-3 text-center ${live ? 'arch-pulse' : ''}`}>{MARK[e.status] ?? '–'}</span>
          {e.tool}
          <span className={`ml-2 text-[12px] font-normal ${e.status === 'error' ? 'text-[#FFB4A5]' : 'text-white/70'}`}>{STATUS[e.status] ?? e.status}</span>
        </span>
        {e.input && <span className="block break-words text-white/70">{e.input}</span>}
        {e.outcome && <span className={`block break-words ${e.status === 'error' ? 'text-[#FFB4A5]' : 'text-white'}`}>{e.outcome}</span>}
      </span>
      <span className="text-white/70 sm:text-right">
        {t}{t && (e.units || e.cached) ? ' · ' : ''}{e.units ? unitsText(e.units) : e.cached ? '0 units' : ''}
      </span>
    </li>
  );
}

/**
 * The record of what was done for this session (FR-26): every step with its tool, input, time, units and outcome, streamed
 * live. Real data only. It is memory-only on the server and goes with "Delete my data".
 */
export default function TracePanel({ sessionId, active }) {
  const { entries, state } = useTrace(sessionId, active);
  const groups = useMemo(() => groupTrace(entries), [entries]);
  const spent = unitsSpent(entries);
  const status = state === 'live' ? 'Live. New steps appear as they happen.' : state === 'connecting' ? 'Connecting…' : state === 'retrying' ? 'Connection lost. Trying again…' : '';

  return (
    <div>
      <p role="status" className="text-[13px] text-ink-soft">{status}</p>
      {entries.length === 0 ? (
        <div className="mt-2 rounded-2xl border border-line bg-paper p-5 text-[15px] leading-relaxed text-ink-soft">
          <p className="font-medium text-ink">Nothing yet.</p>
          <p className="mt-1">Choose a look or change one and each step shows here as it happens, with how long it took and what it cost.</p>
        </div>
      ) : (
        <div className="mt-2 rounded-2xl bg-ink p-4 font-mono text-[13px] text-white sm:p-5">
          <p className="border-b border-white/20 pb-3 text-white/70">
            {entries.length} {entries.length === 1 ? 'step' : 'steps'} · <span className="text-white">{unitsText(spent)}</span> charged in this view
          </p>
          {groups.map((g) => (
            <section key={g.key} aria-label={g.title} className="mt-4 first:mt-3">
              <h3 className="break-words font-sans text-[14px] font-medium text-white">{g.title}</h3>
              <ol className="mt-1 divide-y divide-white/15">{g.entries.map((e) => <Step key={e.id} e={e} />)}</ol>
            </section>
          ))}
        </div>
      )}
      <p className="mt-3 text-[12px] leading-snug text-ink-soft">A real record of the calls made for you in this session. It stays in memory only and goes when you delete your data or the session ends.</p>
    </div>
  );
}
