import AccountNudge from '../components/auth/AccountNudge.jsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession.js';
import { useLooks } from '../hooks/useLooks.js';
import { toggleSelection } from '../lib/compare.js';
import { rupees, TYPE_LABEL } from '../lib/format.js';
import Button from '../components/Button.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import LookThumb from '../components/looks/LookThumb.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] outline-none sm:text-[44px]';
const STATUS = { running: 'Drawing now', done: 'Drawn', partial: 'Partly drawn', failed: 'Did not finish', idle: 'Not drawn yet' };
const STATUS_MARK = { running: '…', done: '✓', partial: '!', failed: '!', idle: '–' };

function Shell({ children }) {
  return <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">{children}</section>;
}

function Card({ look, selected, onToggle, onRemove, removing }) {
  const [confirming, setConfirming] = useState(false);
  const names = ['outfit', 'earrings', 'lipstick', 'eyewear', 'watch'].map((s) => look.items[s]).filter(Boolean);
  const id = `look-${look.id}`;
  return (
    <li className={`flex flex-col rounded-2xl border bg-paper p-4 ${selected ? 'border-rani' : 'border-line'}`}>
      <LookThumb look={look} />
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="truncate text-[17px] font-medium tracking-[-0.01em]">{look.items.outfit?.name ?? 'Look'}</h2>
          <p className="mt-0.5 text-[14px] text-ink-soft">{rupees(look.totalPrice)} · Match {look.score} of 100</p>
        </div>
      </div>
      <p className="mt-2 text-[13px] text-ink-soft"><span aria-hidden="true" className="mr-1.5 font-mono">{STATUS_MARK[look.status]}</span>{STATUS[look.status]}{look.unitsSpent ? ` · ${look.unitsSpent} ${look.unitsSpent === 1 ? 'unit' : 'units'}` : ''}</p>
      <ul className="mt-3 space-y-0.5 text-[13px] text-ink-soft" aria-label="Items">
        {names.map((i) => <li key={i.id} className="truncate"><span>{TYPE_LABEL[i.type]}: </span>{i.name}</li>)}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px]">
          <input type="checkbox" checked={selected} onChange={onToggle} className="size-5 accent-rani" aria-describedby={id} />
          Compare
        </label>
        <Link to={`/looks/${look.id}`} className="inline-flex min-h-11 items-center text-[14px] font-medium text-rani underline underline-offset-2 hover:text-rani-deep">Open<span className="sr-only"> {look.items.outfit?.name}</span></Link>
        {!confirming ? (
          <button type="button" disabled={look.active} onClick={() => setConfirming(true)} className="ml-auto inline-flex min-h-11 items-center text-[14px] text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50">Remove<span className="sr-only"> {look.items.outfit?.name}</span></button>
        ) : (
          <span className="ml-auto flex items-center gap-2">
            <button type="button" disabled={removing} onClick={() => onRemove(look.id)} className="inline-flex h-11 items-center rounded-full bg-alert px-4 text-[14px] font-medium text-white disabled:opacity-60">{removing ? 'Removing…' : 'Remove it'}</button>
            <button type="button" onClick={() => setConfirming(false)} className="inline-flex h-11 items-center px-2 text-[14px] text-ink-soft hover:text-ink">Keep</button>
          </span>
        )}
      </div>
    </li>
  );
}

export default function MyLooks() {
  const { session, error: sessionError, retry, reset } = useSession();
  const onSessionLost = useCallback(() => reset(), [reset]);
  const l = useLooks(session?.sessionId, { onSessionLost });
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [removingId, setRemovingId] = useState(null);
  const heading = useRef(null);
  useEffect(() => { if (l.phase === 'ready') heading.current?.focus({ preventScroll: true }); }, [l.phase]);
  // Drop selections for looks that no longer exist.
  useEffect(() => { setSelected((s) => s.filter((id) => l.looks.some((x) => x.id === id))); }, [l.looks]);

  if (sessionError) {
    return <Shell><h1 className={H1}>We could not start your session</h1><ErrorNote error={sessionError} className="mt-6 max-w-xl" /><div className="mt-8"><Button onClick={retry}>Try again</Button></div></Shell>;
  }
  if (l.phase === 'loading') return <Shell><LoadingBlock label="Loading your looks…" cards={3} /></Shell>;
  if (l.phase === 'error') {
    return (
      <Shell>
        <h1 className={H1}>We could not load your looks</h1>
        <ErrorNote error={l.error} className="mt-6 max-w-xl" />
        <div className="mt-8 flex flex-wrap gap-3"><Button onClick={l.reload}>Try again</Button><Button to="/looks" variant="secondary">Plan new looks</Button></div>
      </Shell>
    );
  }

  const remove = async (id) => { setRemovingId(id); await l.remove(id); setRemovingId(null); };
  const [a, b] = selected;

  return (
    <Shell>
      <h1 ref={heading} tabIndex={-1} className={H1}>My looks</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">
        {l.looks.length === 0 ? 'Looks you choose to see on yourself are kept here. Without an account, that is for today only.' : `${l.looks.length} of ${l.max} kept. Pick any two to compare them side by side.`}
      </p>

      {l.looks.length === 0 ? (
        <div className="mt-10 max-w-xl rounded-2xl border border-line bg-paper p-6 sm:p-8">
          <h2 className="text-[20px] font-medium tracking-[-0.02em]">No looks yet</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">Plan three looks within your budget, then choose &ldquo;See it on me&rdquo; to draw one on your photos.</p>
          <div className="mt-6 flex flex-wrap gap-3"><Button to="/looks">Plan my looks</Button><Button to="/start" variant="secondary">Add my photos</Button></div>
        </div>
      ) : (
        <>
          <ErrorNote error={l.removeError} className="mt-6 max-w-xl" />
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {l.looks.map((look) => (
              <Card key={look.id} look={look} selected={selected.includes(look.id)} onToggle={() => setSelected((s) => toggleSelection(s, look.id))} onRemove={remove} removing={removingId === look.id} />
            ))}
          </ul>
          {l.looks.length >= l.max && <p className="mt-5 text-[14px] text-ink-soft">You have reached {l.max} looks. Drawing a new one removes the oldest.</p>}

          <div className="sticky bottom-0 z-10 -mx-5 mt-8 border-t border-line bg-mist/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8" role="region" aria-label="Compare">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
              <p role="status" className="text-[15px]">
                {selected.length === 0 && 'Tick Compare on two looks.'}
                {selected.length === 1 && 'Pick one more look to compare.'}
                {selected.length === 2 && 'Two looks selected.'}
              </p>
              <div className="flex gap-3">
                {selected.length > 0 && <Button variant="quiet" onClick={() => setSelected([])}>Clear</Button>}
                <Button disabled={selected.length !== 2} onClick={() => navigate(`/compare?a=${a}&b=${b}`)}>Compare these two</Button>
              </div>
            </div>
          </div>
        </>
      )}

      <AccountNudge className="mt-10 max-w-2xl">Without an account these looks are deleted within a day. A free account keeps them, and your colour reading, so you can open them again later.</AccountNudge>
      <div className="mt-10 flex flex-wrap gap-3">
        <Button to="/looks" variant="secondary">Plan new looks</Button>
      </div>
    </Shell>
  );
}
