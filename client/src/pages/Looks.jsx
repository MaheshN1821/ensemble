import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../hooks/useSession.js';
import { usePlan } from '../hooks/usePlan.js';
import { rupees } from '../lib/format.js';
import Button from '../components/Button.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import LookCard from '../components/looks/LookCard.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] outline-none sm:text-[44px]';

function Shell({ children }) {
  return <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">{children}</section>;
}

function BudgetTry({ plan, constraints, replan, busy }) {
  const id = useId();
  const [value, setValue] = useState(String(constraints.budgetInr ?? plan.budgetInr));
  useEffect(() => { setValue(String(constraints.budgetInr ?? plan.budgetInr)); }, [constraints.budgetInr, plan.budgetInr]);
  const trying = constraints.budgetInr !== undefined;
  return (
    <form
      className="mt-8 flex flex-wrap items-end gap-3"
      onSubmit={(e) => { e.preventDefault(); const n = Number(value); if (Number.isFinite(n)) replan({ ...constraints, budgetInr: Math.round(n) }); }}
    >
      <div>
        <label htmlFor={id} className="text-[14px] text-ink-soft">Try a different budget</label>
        <div className="mt-1 flex items-center rounded-xl border border-line bg-paper">
          <span className="pl-4 text-[17px] text-ink-soft" aria-hidden="true">₹</span>
          <input id={id} type="number" inputMode="numeric" min={2000} max={300000} step={500} value={value} onChange={(e) => setValue(e.target.value)} className="h-11 w-36 bg-transparent px-2 text-[16px] outline-none" />
        </div>
      </div>
      <Button type="submit" variant="secondary" className="h-11 px-5 text-sm" disabled={busy}>{busy ? 'Planning…' : 'Plan again'}</Button>
      {trying && <Button variant="quiet" className="h-11 text-sm" onClick={() => replan({})}>Back to my saved budget</Button>}
    </form>
  );
}

function Ready({ plan, constraints, replan, busy, see }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const { profile, occasion, catalog } = plan;
  const over = plan.status === 'over_budget';

  return (
    <div>
      <h1 ref={heading} tabIndex={-1} className={H1}>{over ? 'Nothing fits that budget yet' : 'Your looks'}</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">
        Planned for {occasion.label.toLowerCase()} with a {profile.undertoneLabel.toLowerCase()} undertone, from the {catalog.name.toLowerCase().replace(/ catalog$/, '')} catalog, within {rupees(plan.budgetInr)}.
        {constraints.budgetInr !== undefined && ' You are trying a different budget here. Your saved budget is unchanged.'}
      </p>

      {catalog.fellBack && <p role="status" className="mt-4 max-w-[60ch] rounded-xl bg-zari-wash px-4 py-3 text-[15px]">The catalog you chose is no longer available, so we used the sample catalog.</p>}

      {plan.relaxed.length > 0 && (
        <div role="status" className="mt-6 max-w-[64ch] rounded-xl border border-line bg-paper px-5 py-4">
          <h2 className="text-[16px] font-medium">What we relaxed</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-relaxed">{plan.relaxed.map((r) => <li key={r.type}>{r.text}</li>)}</ul>
        </div>
      )}
      {plan.notes.map((n) => <p key={n} role="status" className="mt-4 max-w-[64ch] text-[15px] text-ink-soft">{n}</p>)}

      {over && (
        <>
          <p className="mt-6 max-w-[64ch] text-[17px] leading-relaxed">{plan.message}</p>
          <div className="mt-6 max-w-md"><LookCard look={plan.closest} label="Closest look" scoreNote={plan.scoreNote} closest onTryBudget={() => replan({ ...constraints, budgetInr: plan.minBudgetInr })} /></div>
        </>
      )}

      {plan.status === 'no_items' && (
        <div className="mt-8">
          <p className="max-w-[60ch] text-[17px] leading-relaxed">{plan.message}</p>
          <div className="mt-6 flex flex-wrap gap-3"><Button to="/catalog">See the sample catalog</Button><Button to="/start?step=details" variant="secondary">Change occasion</Button></div>
        </div>
      )}

      {plan.status === 'ok' && (
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {plan.looks.map((l) => (
            <LookCard
              key={l.id} look={l} label={`Look ${l.rank}`} scoreNote={plan.scoreNote}
              onSee={() => see.start(l)} seeBusy={see.busyId === l.id} seeError={see.errorId === l.id ? see.error : null}
              maxUnits={see.maxUnits(l)} renderedStatus={see.statusOf(l.id)}
            />
          ))}
        </div>
      )}

      <BudgetTry plan={plan} constraints={constraints} replan={replan} busy={busy} />

      <details className="mt-10 border-t border-line py-6">
        <summary className="cursor-pointer text-[15px] text-ink-soft hover:text-ink">How we choose looks</summary>
        <div className="mt-4 max-w-[64ch] space-y-3 text-[15px] leading-relaxed text-ink-soft">
          <p>Your budget is a hard limit. Within it, we search the catalog and score each combination with fixed styling rules. No language model picks items, prices or scores.</p>
          <ul className="space-y-1.5">
            {plan.weights.map((w) => <li key={w.key}><span className="font-medium text-ink">{w.label} ({w.weight} points).</span> {w.blurb}</li>)}
          </ul>
          <p>{plan.scoreNote} The same details always give the same looks.</p>
        </div>
      </details>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button to="/profile" variant="secondary">Back to my colours</Button>
        <Button to="/start?step=details" variant="secondary">Change occasion or budget</Button>
        <Button to="/my-looks" variant="quiet">My drawn looks</Button>
      </div>
    </div>
  );
}

export default function Looks() {
  const { session, error: sessionError, retry: retrySession, reset } = useSession();
  const onSessionLost = useCallback(() => reset(), [reset]);
  const p = usePlan(session?.sessionId, { onSessionLost });
  const [busy, setBusy] = useState(false);
  const replan = useCallback(async (c) => { setBusy(true); try { await p.replan(c); } finally { setBusy(false); } }, [p]);

  // Drawing a look on the shopper's photos (Stage 6): what it costs, what is already drawn, and the start action.
  const navigate = useNavigate();
  const sessionId = session?.sessionId;
  const [meta, setMeta] = useState({ config: null, looks: {} });
  const [seeing, setSeeing] = useState({ busyId: null, errorId: null, error: null });
  useEffect(() => {
    if (!sessionId) return undefined;
    let live = true;
    Promise.all([api('/api/render/config'), api('/api/sessions/me/looks', { sessionId })])
      .then(([config, l]) => live && setMeta({ config, looks: Object.fromEntries(l.looks.map((x) => [x.id, x.status])) }))
      .catch(() => {}); // the buttons still work without the cost hint
    return () => { live = false; };
  }, [sessionId]);
  const see = {
    ...seeing,
    statusOf: (id) => meta.looks[id] ?? null,
    maxUnits: (look) => (meta.config ? meta.config.stages.filter((s) => look.items[s.id]).reduce((n, s) => n + s.units, 0) : null),
    start: async (look) => {
      setSeeing({ busyId: look.id, errorId: null, error: null });
      try {
        await api('/api/sessions/me/looks', { method: 'POST', sessionId, body: { itemIds: look.itemIds, budgetInr: p.plan?.budgetInr } });
        navigate(`/looks/${look.id}`);
      } catch (e) {
        if (e.code === 'SESSION_EXPIRED') reset();
        setSeeing({ busyId: null, errorId: look.id, error: e });
      }
    },
  };

  if (sessionError) {
    return <Shell><h1 className={H1}>We could not start your session</h1><ErrorNote error={sessionError} className="mt-6 max-w-xl" /><div className="mt-8"><Button onClick={retrySession}>Try again</Button></div></Shell>;
  }
  if (p.phase === 'loading') return <Shell><LoadingBlock label="Planning your looks…" cards={3} /></Shell>;

  if (p.phase === 'error') {
    const code = p.error?.code;
    const needsProfile = code === 'NO_PROFILE';
    const needsDetails = code === 'PREFERENCES_REQUIRED' || code === 'CONSENT_REQUIRED';
    return (
      <Shell>
        <h1 className={H1}>{needsProfile ? 'Read your colours first' : needsDetails ? 'Finish your details first' : 'We could not plan your looks'}</h1>
        <ErrorNote error={p.error} className="mt-6 max-w-xl" />
        <div className="mt-8 flex flex-wrap gap-3">
          {needsProfile && <Button to="/profile">Read my colours</Button>}
          {needsDetails && <Button to="/start">Continue my details</Button>}
          {!needsProfile && !needsDetails && <Button onClick={() => p.replan(p.constraints)}>Try again</Button>}
        </div>
      </Shell>
    );
  }
  return <Shell><Ready plan={p.plan} constraints={p.constraints} replan={replan} busy={busy} see={see} /></Shell>;
}
