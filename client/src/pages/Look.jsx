import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSession } from '../hooks/useSession.js';
import { useLook } from '../hooks/useLook.js';
import { api } from '../lib/api.js';
import { downloadLook } from '../lib/downloadLook.js';
import Button from '../components/Button.jsx';
import LookResult, { ItemList, StageList } from '../components/looks/LookResult.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] outline-none sm:text-[44px]';

function Shell({ children }) {
  return <section className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">{children}</section>;
}

const HEADLINE = { running: 'Drawing your look', done: 'Your look', partial: 'Part of your look is ready', failed: 'We could not draw this look', idle: 'Your look' };

function Share({ sessionId, lookId }) {
  const [state, setState] = useState({ phase: 'idle' });
  const create = async () => {
    setState({ phase: 'working' });
    try {
      const out = await api(`/api/sessions/me/looks/${lookId}/share`, { method: 'POST', sessionId });
      const url = `${window.location.origin}/s/${out.token}`;
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch { /* the link is shown below to copy by hand */ }
      setState({ phase: 'ready', url, expiresAt: out.expiresAt, copied });
    } catch (e) { setState({ phase: 'error', error: e }); }
  };
  return (
    <div className="w-full">
      <Button variant="secondary" onClick={create} disabled={state.phase === 'working'}>{state.phase === 'working' ? 'Making a link…' : 'Create a share link'}</Button>
      {state.phase === 'error' && <ErrorNote error={state.error} className="mt-3 max-w-xl" />}
      {state.phase === 'ready' && (
        <div role="status" className="mt-3 max-w-xl rounded-xl border border-line bg-paper p-4 text-[15px]">
          <p>{state.copied ? 'Link copied. ' : ''}Anyone with this link can see these two pictures until {new Date(state.expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}. Deleting your data ends it sooner.</p>
          <input readOnly value={state.url} onFocus={(e) => e.target.select()} aria-label="Share link" className="mt-3 h-11 w-full rounded-lg border border-line bg-mist px-3 font-mono text-[13px]" />
        </div>
      )}
    </div>
  );
}

function Ready({ look, sessionId, retry, actionError }) {
  const heading = useRef(null);
  const [downloadError, setDownloadError] = useState(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const drawn = Boolean(look.images.body || look.images.face);
  const download = async () => { setDownloadError(null); try { await downloadLook(look); } catch (e) { setDownloadError(e); } };

  return (
    <div>
      <h1 ref={heading} tabIndex={-1} className={H1}>{HEADLINE[look.status]}</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">
        {look.status === 'running' && 'Each step shows below as it finishes. You can leave this page open or come back to it.'}
        {look.status === 'done' && (look.sampleModel ? 'Drawn on the sample model.' : 'Drawn on your photos.')}
        {look.status === 'partial' && 'Some steps finished and some did not. Nothing was charged for the ones that did not. Trying again draws only what is missing.'}
        {look.status === 'failed' && 'Nothing was charged. Read what went wrong below, then try again.'}
      </p>

      <div className="mt-8"><LookResult look={look} /></div>

      <div className="mt-8 flex flex-wrap items-start gap-3">
        {look.canRetry && <Button onClick={retry}>Try the missing steps again</Button>}
        {drawn && <Button variant="secondary" onClick={download}>Download as a picture</Button>}
        <Button to="/looks" variant="secondary">Back to my looks</Button>
      </div>
      <ErrorNote error={actionError} className="mt-4 max-w-xl" />
      <ErrorNote error={downloadError} className="mt-4 max-w-xl" />
      {drawn && !look.active && <div className="mt-6"><Share sessionId={sessionId} lookId={look.id} /></div>}

      <StageList look={look} />
      <ItemList look={look} />

      {look.reasons.length > 0 && (
        <section aria-labelledby="why-h" className="mt-10">
          <h2 id="why-h" className="text-[20px] font-medium tracking-[-0.02em]">Why we picked it</h2>
          <ul className="mt-3 space-y-1.5 text-[15px] leading-snug">{look.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden="true" className="text-peacock">✓</span><span>{r}</span></li>)}</ul>
          <p className="mt-3 text-[13px] text-ink-soft">Match {look.score} of 100, from the app&apos;s styling rules. It is not a beauty or medical rating.</p>
        </section>
      )}
    </div>
  );
}

export default function Look() {
  const { lookId } = useParams();
  const { session, error: sessionError, retry: retrySession, reset } = useSession();
  const onSessionLost = useCallback(() => reset(), [reset]);
  const l = useLook(session?.sessionId, lookId, { onSessionLost });

  if (sessionError) return <Shell><h1 className={H1}>We could not start your session</h1><ErrorNote error={sessionError} className="mt-6 max-w-xl" /><div className="mt-8"><Button onClick={retrySession}>Try again</Button></div></Shell>;
  if (l.phase === 'loading') return <Shell><p role="status" className="text-ink-soft">Loading your look…</p></Shell>;
  if (l.phase === 'error') {
    const gone = l.error?.code === 'NOT_FOUND';
    return (
      <Shell>
        <h1 className={H1}>{gone ? 'That look is not here any more' : 'We could not open this look'}</h1>
        <ErrorNote error={l.error} className="mt-6 max-w-xl" />
        <div className="mt-8 flex flex-wrap gap-3">{gone ? <Button to="/looks">Plan my looks</Button> : <Button onClick={l.reload}>Try again</Button>}</div>
      </Shell>
    );
  }
  return <Shell><Ready look={l.look} sessionId={session.sessionId} retry={l.retry} actionError={l.actionError} /></Shell>;
}
