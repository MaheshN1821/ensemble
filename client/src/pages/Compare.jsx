import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { compareLooks, pairFromParams } from '../lib/compare.js';
import { rupees, TYPE_LABEL } from '../lib/format.js';
import { useSession } from '../hooks/useSession.js';
import { useLooks } from '../hooks/useLooks.js';
import Button from '../components/Button.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import ZoomImage from '../components/ui/ZoomImage.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] outline-none sm:text-[44px]';

function Shell({ children }) {
  return <section className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">{children}</section>;
}

function useTwoLooks(sessionId, ids, onSessionLost) {
  const [state, setState] = useState({ phase: 'idle', looks: null, error: null });
  const key = ids.join('|');
  useEffect(() => {
    if (!sessionId || ids.length !== 2) { setState({ phase: 'idle', looks: null, error: null }); return undefined; }
    const ac = new AbortController();
    setState({ phase: 'loading', looks: null, error: null });
    Promise.all(ids.map((id) => api(`/api/sessions/me/looks/${id}`, { sessionId, signal: ac.signal })))
      .then(([x, y]) => setState({ phase: 'ready', looks: [x.look, y.look], error: null }))
      .catch((e) => {
        if (ac.signal.aborted) return;
        if (e.code === 'SESSION_EXPIRED') onSessionLost?.();
        setState({ phase: 'error', looks: null, error: e });
      });
    return () => ac.abort();
  }, [sessionId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

function Picker({ looks, a, b, onChange }) {
  const options = looks.map((l) => ({ id: l.id, label: `${l.items.outfit?.name ?? 'Look'} · ${rupees(l.totalPrice)}` }));
  const field = (label, value, other, key) => (
    <div className="min-w-0 flex-1">
      <label htmlFor={`pick-${key}`} className="text-[14px] font-medium">{label}</label>
      <select id={`pick-${key}`} value={value ?? ''} onChange={(e) => onChange(key, e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-line bg-paper px-3 text-[16px]">
        <option value="" disabled>Choose a look</option>
        {options.map((o) => <option key={o.id} value={o.id} disabled={o.id === other}>{o.label}</option>)}
      </select>
    </div>
  );
  return <div className="mt-8 flex flex-col gap-4 sm:flex-row">{field('Look A', a, b, 'a')}{field('Look B', b, a, 'b')}</div>;
}

function Column({ look, letter }) {
  return (
    <div className="min-w-0">
      <h2 className="text-[17px] font-medium tracking-[-0.01em]">Look {letter}</h2>
      <p className="mt-0.5 truncate text-[14px] text-ink-soft">{look.items.outfit?.name}</p>
      <div className="mt-3 space-y-3">
        {look.images.body ? (
          <figure className="m-0 overflow-hidden rounded-xl border border-line bg-paper"><ZoomImage src={look.images.body.url} alt={`Look ${letter}: ${look.images.body.alt}`} caption={look.label} /></figure>
        ) : <p className="rounded-xl border border-dashed border-line p-4 text-[13px] text-ink-soft">Look {letter}: full-length photo not drawn yet.</p>}
        {look.images.face ? (
          <figure className="m-0 overflow-hidden rounded-xl border border-line bg-paper"><ZoomImage src={look.images.face.url} alt={`Look ${letter}: ${look.images.face.alt}`} caption={look.label} /></figure>
        ) : <p className="rounded-xl border border-dashed border-line p-4 text-[13px] text-ink-soft">Look {letter}: close-up not drawn yet.</p>}
      </div>
      <p className="mt-3"><Link to={`/looks/${look.id}`} className="text-[14px] font-medium text-rani underline underline-offset-2 hover:text-rani-deep">Open look {letter}</Link></p>
    </div>
  );
}

function Cell({ item }) {
  if (!item) return <span className="text-ink-soft">None</span>;
  return <><span className="block">{item.name}</span><span className="font-mono text-[12px] text-ink-soft">{rupees(item.price)}</span></>;
}

export function Result({ a, b, swap }) {
  const c = compareLooks(a, b);
  return (
    <div>
      <p role="status" className="mt-4 max-w-[60ch] text-[17px] leading-relaxed">{c.summary}</p>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-6">
        <Column look={a} letter="A" />
        <Column look={b} letter="B" />
      </div>

      <h2 className="mt-12 text-[20px] font-medium tracking-[-0.02em]">Item by item</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[28rem] table-fixed text-left text-[14px]">
          <caption className="sr-only">Items in look A and look B, and whether they differ</caption>
          <thead className="text-ink-soft">
            <tr><th scope="col" className="w-[22%] py-2 pr-3 font-normal">Item</th><th scope="col" className="py-2 pr-3 font-normal">Look A</th><th scope="col" className="py-2 pr-3 font-normal">Look B</th><th scope="col" className="w-[17%] py-2 font-normal">Compared</th></tr>
          </thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.slot} className="border-t border-line align-top">
                <th scope="row" className="py-3 pr-3 font-medium">{TYPE_LABEL[r.slot]}</th>
                <td className="py-3 pr-3"><Cell item={r.a} /></td>
                <td className="py-3 pr-3"><Cell item={r.b} /></td>
                <td className="py-3"><span aria-hidden="true" className="mr-1 font-mono">{r.same ? '=' : '≠'}</span>{r.same ? 'Same' : r.onlyIn === 'a' ? 'Only in A' : r.onlyIn === 'b' ? 'Only in B' : 'Different'}</td>
              </tr>
            ))}
            <tr className="border-t border-line"><th scope="row" className="py-3 pr-3 font-medium">Total</th><td className="py-3 pr-3 font-mono">{rupees(a.totalPrice)}</td><td className="py-3 pr-3 font-mono">{rupees(b.totalPrice)}</td><td className="py-3">{c.priceDiff === 0 ? 'Same' : `${rupees(Math.abs(c.priceDiff))} ${c.priceDiff > 0 ? 'more in B' : 'less in B'}`}</td></tr>
            <tr className="border-t border-line"><th scope="row" className="py-3 pr-3 font-medium">Match</th><td className="py-3 pr-3 font-mono">{a.score} of 100</td><td className="py-3 pr-3 font-mono">{b.score} of 100</td><td className="py-3">{c.scoreDiff === 0 ? 'Same' : `${Math.abs(c.scoreDiff)} ${c.scoreDiff > 0 ? 'higher in B' : 'higher in A'}`}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px] text-ink-soft">Match scores come from the app&apos;s styling rules. They are guidance, not a rating of you.</p>

      {(c.reasons.onlyA.length > 0 || c.reasons.onlyB.length > 0) && (
        <>
          <h2 className="mt-12 text-[20px] font-medium tracking-[-0.02em]">Why each was picked</h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {[['A', c.reasons.onlyA], ['B', c.reasons.onlyB]].map(([letter, list]) => (
              <div key={letter}>
                <h3 className="text-[15px] font-medium">Only look {letter}</h3>
                {list.length ? <ul className="mt-2 space-y-1.5 text-[15px] leading-snug">{list.map((r) => <li key={r} className="flex gap-2"><span aria-hidden="true" className="text-peacock">✓</span><span>{r}</span></li>)}</ul> : <p className="mt-2 text-[14px] text-ink-soft">Nothing that look B does not also have.</p>}
              </div>
            ))}
          </div>
          {c.reasons.shared.length > 0 && <p className="mt-4 text-[14px] text-ink-soft">Both: {c.reasons.shared.join(' ')}</p>}
        </>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={swap}>Swap A and B</Button>
        <Button to="/my-looks" variant="secondary">Back to my looks</Button>
      </div>
    </div>
  );
}

export default function Compare() {
  const { session, error: sessionError, retry, reset } = useSession();
  const onSessionLost = useCallback(() => reset(), [reset]);
  const [params, setParams] = useSearchParams();
  const { a, b } = pairFromParams(params);
  const sessionId = session?.sessionId;
  const list = useLooks(sessionId, { onSessionLost });
  const two = useTwoLooks(sessionId, a && b ? [a, b] : [], onSessionLost);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [two.phase]);

  const set = (key, value) => { const next = { a, b, [key]: value }; setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true }); };
  const swap = () => setParams({ a: b, b: a }, { replace: true });

  if (sessionError) return <Shell><h1 className={H1}>We could not start your session</h1><ErrorNote error={sessionError} className="mt-6 max-w-xl" /><div className="mt-8"><Button onClick={retry}>Try again</Button></div></Shell>;
  if (list.phase === 'loading' && !a && !b) return <Shell><LoadingBlock label="Loading your looks…" cards={2} /></Shell>;

  if (list.phase === 'ready' && list.looks.length < 2 && two.phase !== 'ready') {
    return (
      <Shell>
        <h1 ref={heading} tabIndex={-1} className={H1}>Compare two looks</h1>
        <div className="mt-8 max-w-xl rounded-2xl border border-line bg-paper p-6 sm:p-8">
          <h2 className="text-[20px] font-medium tracking-[-0.02em]">You need two looks to compare</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{list.looks.length === 0 ? 'You have not drawn a look yet.' : 'You have one look so far.'} Choose &ldquo;See it on me&rdquo; on another look, then come back.</p>
          <div className="mt-6 flex flex-wrap gap-3"><Button to="/looks">Plan my looks</Button>{list.looks.length > 0 && <Button to="/my-looks" variant="secondary">My looks</Button>}</div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 ref={heading} tabIndex={-1} className={H1}>Compare two looks</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">Look A and look B side by side. Differences are written out, not just coloured.</p>
      {list.phase === 'ready' && <Picker looks={list.looks} a={a} b={b} onChange={set} />}
      {list.phase === 'error' && <ErrorNote error={list.error} className="mt-6 max-w-xl" />}

      {two.phase === 'idle' && <p role="status" className="mt-8 text-[16px] text-ink-soft">Choose two different looks above to compare them.</p>}
      {two.phase === 'loading' && <LoadingBlock className="mt-8" label="Opening both looks…" />}
      {two.phase === 'error' && (
        <div className="mt-8">
          <ErrorNote error={two.error} className="max-w-xl" />
          <p className="mt-3 text-[15px] text-ink-soft">{two.error?.code === 'NOT_FOUND' ? 'One of these looks is not in your session any more. Choose again above.' : ''}</p>
          <div className="mt-4"><Button to="/my-looks" variant="secondary">Back to my looks</Button></div>
        </div>
      )}
      {two.phase === 'ready' && <Result a={two.looks[0]} b={two.looks[1]} swap={swap} />}
    </Shell>
  );
}
