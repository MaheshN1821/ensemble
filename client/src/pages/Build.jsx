import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession.js';
import { useBuilder } from '../hooks/useBuilder.js';
import Button from '../components/Button.jsx';
import StoreBanner from '../components/StoreBanner.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import ItemChoice from '../components/build/ItemChoice.jsx';
import YourLook from '../components/build/YourLook.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';
import { rupees } from '../lib/format.js';
import { totalOf } from '../lib/build.js';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] outline-none sm:text-[44px]';

function Shell({ children }) {
  return <section className="mx-auto max-w-6xl px-5 py-12 pb-28 sm:px-8 sm:py-16 lg:pb-16">{children}</section>;
}

function Ready({ b, sessionId }) {
  const navigate = useNavigate();
  const [slot, setSlot] = useState('outfit');
  const { catalog, items, budgetInr, budget: range } = b.data;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const sellers = useMemo(() => [...new Set(items.map((i) => i.seller).filter(Boolean))].sort(), [items]);
  const limit = b.preview.look?.budgetInr ?? b.budget ?? budgetInr;
  const total = totalOf(b.picks, byId);
  const draw = async () => { const id = await b.draw(); if (id) navigate(`/looks/${id}`); };

  return (
    <div>
      <StoreBanner sessionId={sessionId} className="mb-8 max-w-2xl" onChange={b.reload} />
      <h1 tabIndex={-1} className={H1}>Build your own look</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">
        Choose the pieces you like from {catalog.name.toLowerCase().replace(/ catalog$/, '')}: an outfit, earrings, a lipstick and more. You can try on an outfit or preview accessories on their own. Your budget stays a hard limit.
      </p>
      {catalog.fellBack && <p role="status" className="mt-4 max-w-[60ch] rounded-xl bg-zari-wash px-4 py-3 text-[15px]">That store has no items right now, so you are choosing from every retailer.</p>}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <ItemChoice items={items} counts={catalog.counts} picks={b.picks} onToggle={b.toggle} slot={slot} onSlot={setSlot} budget={limit} byId={byId} sellers={sellers} />
        <div className="lg:sticky lg:top-6">
          <YourLook
            id="your-look" byId={byId} picks={b.picks} onRemove={b.remove} onPick={setSlot} preview={b.preview} saved={budgetInr}
            budget={b.budget} setBudget={b.setBudget} range={range} onDraw={draw} drawing={b.drawing} units={b.units} drawnStatus={b.drawnStatus} onClear={b.clear}
          />
        </div>
      </div>

      {/* Small screens: the total and a way to the look, always in reach. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 px-5 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <p className="text-[15px]"><span className={total > limit ? 'text-alert' : ''}>{rupees(total)}</span> <span className="text-ink-soft">of {rupees(limit)}</span></p>
          <Button href="#your-look" className="h-11 px-5 text-sm">{b.picks.outfit ? 'Review and draw' : 'Your look'}</Button>
        </div>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-3">
        <Button to="/looks" variant="secondary">Back to planned looks</Button>
        <Button to="/my-looks" variant="quiet">My drawn looks</Button>
      </div>
    </div>
  );
}

export default function Build() {
  const { session, error: sessionError, retry: retrySession, reset } = useSession();
  const { search } = useLocation();
  const onSessionLost = useCallback(() => reset(), [reset]);
  const b = useBuilder(session?.sessionId, search, { onSessionLost });

  if (sessionError) return <Shell><h1 className={H1}>We could not start your session</h1><ErrorNote error={sessionError} className="mt-6 max-w-xl" /><div className="mt-8"><Button onClick={retrySession}>Try again</Button></div></Shell>;
  if (b.phase === 'loading') return <Shell><LoadingBlock label="Opening the catalog…" cards={3} /></Shell>;
  if (b.phase === 'error') {
    const code = b.error?.code;
    const needsProfile = code === 'NO_PROFILE';
    const needsDetails = code === 'PREFERENCES_REQUIRED' || code === 'CONSENT_REQUIRED';
    return (
      <Shell>
        <h1 className={H1}>{needsProfile ? 'Read your colours first' : needsDetails ? 'Finish your details first' : 'We could not open the catalog'}</h1>
        <ErrorNote error={b.error} className="mt-6 max-w-xl" />
        <div className="mt-8 flex flex-wrap gap-3">
          {needsProfile && <Button to="/profile">Read my colours</Button>}
          {needsDetails && <Button to="/start">Continue my details</Button>}
          {!needsProfile && !needsDetails && <Button onClick={b.reload}>Try again</Button>}
        </div>
      </Shell>
    );
  }
  return <Shell><Ready b={b} sessionId={session.sessionId} /></Shell>;
}
