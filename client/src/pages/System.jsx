import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../hooks/useSession.js';
import Button from '../components/Button.jsx';

function Dot({ ok }) {
  return <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-peacock' : 'bg-alert'}`} />;
}

function Row({ label, ok, text, detail }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-t border-line py-4 sm:grid-cols-[220px_1fr]">
      <dt className="text-[15px] font-medium">{label}</dt>
      <dd className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] sm:col-span-1">
        <span className="inline-flex items-center gap-2">
          <Dot ok={ok} />
          {text}
        </span>
        {detail && <span className="text-ink-soft">{detail}</span>}
      </dd>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="mt-14">
      <h2 className="text-[24px] font-light tracking-[-0.02em]">{title}</h2>
      {hint && <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function System() {
  const { session, error: sessionError, retry } = useSession();
  const [status, setStatus] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [costs, setCosts] = useState(null);
  const [probe, setProbe] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const loadStatus = useCallback(() => api('/api/system/status').then(setStatus).catch((e) => setError(e.message)), []);
  const loadLedger = useCallback(
    () => (session ? api('/api/sessions/me/ledger', { sessionId: session.sessionId }).then(setLedger).catch((e) => setError(e.message)) : null),
    [session],
  );

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { loadLedger(); }, [loadLedger]);

  const run = async (name, fn) => {
    setBusy(name);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
      loadStatus();
      loadLedger();
    }
  };

  const fetchCosts = () =>
    run('costs', async () => setCosts(await api('/api/youcam/feature-cost', { sessionId: session?.sessionId })));

  const runProbe = () =>
    run('probe', async () => {
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('Choose a JPG or PNG selfie first.');
      const body = new FormData();
      body.append('image', file);
      setProbe(null);
      setProbe(await api('/api/dev/probe/skin-tone', { method: 'POST', body, sessionId: session.sessionId }));
    });

  const q = status?.queue;
  const used = ledger?.unitsUsed ?? 0;
  const cap = ledger?.cap ?? session?.caps?.units ?? 0;

  return (
    <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
      <h1 className="text-[40px] font-light leading-[1.05] tracking-[-0.035em] sm:text-[52px]">System check</h1>
      <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-ink-soft">
        Confirms that the app, the database, image storage and the try-on service are connected, and records every
        unit spent. The same data will power the “Under the hood” panel.
      </p>

      {(error || sessionError) && (
        <div role="alert" className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-alert-wash px-5 py-4 text-[15px] text-alert">
          <span>{error || sessionError.message}</span>
          {sessionError && <button onClick={retry} className="font-medium underline underline-offset-4">Try again</button>}
        </div>
      )}

      <Section title="Services">
        <dl>
          <Row label="API server" ok={status?.api === 'ok'} text={status ? 'Running' : 'Checking…'} />
          <Row label="Database" ok={status?.database?.state === 'connected'} text={status?.database?.state === 'connected' ? 'Connected' : status?.database?.state ?? 'Checking…'} />
          <Row label="Try-on service key" ok={Boolean(status?.youcam?.keyConfigured)} text={status?.youcam?.keyConfigured ? 'Key present on the server' : 'Key missing'} detail={status?.youcam?.baseUrl} />
          <Row label="Image storage" ok={Boolean(status?.storage?.configured)} text={status?.storage?.configured ? 'Cloudinary connected' : 'Cloudinary not configured'} />
          <Row
            label="Request queue"
            ok={Boolean(q)}
            text={q ? `${q.active} running, ${q.queued} waiting` : 'Checking…'}
            detail={q ? q.buckets.map((b) => `${b.name}: ${b.available}/${b.capacity} free`).join('  ·  ') : ''}
          />
        </dl>
      </Section>

      <Section title="Unit governor" hint="Units are only charged when a task succeeds. The session stops cleanly at its limit.">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[32px] font-light tracking-[-0.03em]">
            {used} <span className="text-ink-soft">of {cap || '…'} units used</span>
          </p>
          {status && <p className="text-sm text-ink-soft">Demo-wide daily limit: {status.caps.globalDailyUnits}</p>}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={used} aria-label="Units used this session">
          <div className="h-full rounded-full bg-rani transition-[width] duration-500" style={{ width: cap ? `${Math.min(100, (used / cap) * 100)}%` : 0 }} />
        </div>
      </Section>

      <Section title="Live unit prices" hint="Read from the try-on service when you ask, then cached for ten minutes. Free to fetch.">
        <Button variant="secondary" onClick={fetchCosts} disabled={!session || busy === 'costs'}>
          {busy === 'costs' ? 'Fetching…' : 'Fetch live prices'}
        </Button>
        {costs && (
          <details open className="mt-5 rounded-2xl border border-line bg-paper">
            <summary className="cursor-pointer px-5 py-4 text-[15px] font-medium">
              Response {costs.cached ? '(cached)' : '(fresh)'}
            </summary>
            <pre className="max-h-96 overflow-auto border-t border-line px-5 py-4 font-mono text-[13px] leading-relaxed">{JSON.stringify(costs.data, null, 2)}</pre>
          </details>
        )}
      </Section>

      {status?.devRoutes && (
        <Section title="Run one real task" hint="Sends a selfie through the whole pipeline: upload, task, polling, result. This spends units from your allowance.">
          <div className="flex flex-wrap items-center gap-3">
            <label className="sr-only" htmlFor="probe-file">Selfie (JPG or PNG)</label>
            <input
              id="probe-file"
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png"
              className="max-w-full text-[15px] file:mr-4 file:h-11 file:rounded-full file:border file:border-line file:bg-paper file:px-5 file:text-[15px] file:font-medium hover:file:border-ink"
            />
            <Button onClick={runProbe} disabled={!session || busy === 'probe'}>
              {busy === 'probe' ? 'Analysing…' : 'Run skin tone analysis'}
            </Button>
          </div>
          {busy === 'probe' && <p className="mt-3 text-[15px] text-ink-soft" role="status">This usually takes a few seconds.</p>}
          {probe && (
            <div className="mt-5 rounded-2xl border border-line bg-paper">
              <p className="px-5 py-4 text-[15px]">
                Done in {(probe.durationMs / 1000).toFixed(1)} s. Spent {probe.units} {probe.units === 1 ? 'unit' : 'units'}
                {probe.unitsKnown ? '' : ' (estimated, price not matched yet)'}.
              </p>
              <pre className="max-h-96 overflow-auto border-t border-line px-5 py-4 font-mono text-[13px] leading-relaxed">{JSON.stringify(probe.results, null, 2)}</pre>
            </div>
          )}
        </Section>
      )}

      <Section title="Ledger" hint="Every call that touches the try-on service, newest first.">
        {!ledger || ledger.entries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-[15px] text-ink-soft">
            Nothing recorded yet. Fetch the live prices above to make the first entry.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[14px]">
              <thead className="text-ink-soft">
                <tr>
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Step</th>
                  <th className="py-2 pr-4 font-medium">Feature</th>
                  <th className="py-2 pr-4 text-right font-medium">Duration</th>
                  <th className="py-2 pr-4 text-right font-medium">Units</th>
                  <th className="py-2 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[13px]">
                {ledger.entries.map((e) => (
                  <tr key={e._id} className="border-t border-line">
                    <td className="py-3 pr-4">{time(e.createdAt)}</td>
                    <td className="py-3 pr-4">{e.kind}</td>
                    <td className="py-3 pr-4">{e.feature ?? '-'}</td>
                    <td className="py-3 pr-4 text-right">{(e.durationMs / 1000).toFixed(1)} s</td>
                    <td className="py-3 pr-4 text-right">{e.units}</td>
                    <td className="py-3 font-sans text-[14px]">
                      <span className="inline-flex items-center gap-2"><Dot ok={e.success} />{e.success ? 'Done' : `Failed${e.errorCode ? ` (${e.errorCode})` : ''}`}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
