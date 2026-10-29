import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { rupees } from '../lib/format.js';
import { useAuth } from '../hooks/useAuth.jsx';
import AuthForm from '../components/auth/AuthForm.jsx';
import AccountSettings from '../components/auth/AccountSettings.jsx';
import Button from '../components/Button.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] sm:text-[44px]';
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const cap = (s) => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : '');

function Shell({ children }) {
  return <section className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">{children}</section>;
}
function Panel({ id, title, children, action }) {
  return (
    <section className="rounded-2xl border border-line bg-paper p-5 sm:p-6" aria-labelledby={id}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 id={id} className="text-[20px] font-medium tracking-[-0.02em]">{title}</h2>{action}</div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SignedOut() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [welcome, setWelcome] = useState(null);
  const next = params.get('next');
  return (
    <Shell>
      <h1 className={H1}>Your account</h1>
      <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-ink-soft">An account is optional. Everything on Ensemble works without one. If you create one, we keep your skin colour reading, your looks and your details so you can come back to them any time.</p>
      <div className="mt-10 max-w-md rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <AuthForm role="shopper" initialMode="register" onDone={(out, mode) => {
          if (out.session?.adopted) setWelcome('We saved what you were working on to your account.');
          else if (out.session?.switched) setWelcome('Welcome back. We opened your saved looks.');
          navigate(next && next.startsWith('/') ? next : '/account', { replace: true, state: { welcome: mode } });
        }} />
      </div>
      {welcome && <p role="status" className="mt-4 text-peacock">{welcome}</p>}
      <p className="mt-8 text-[14px] text-ink-soft">Not now? <Link to="/start" className="text-rani underline underline-offset-4">Carry on without an account</Link>. Are you a retailer? <Link to="/retailer" className="text-rani underline underline-offset-4">Sign in here</Link>.</p>
    </Shell>
  );
}

function SignedIn() {
  const { shopper, signOut, forget } = useAuth();
  const token = shopper.token;
  const [state, setState] = useState({ phase: 'loading', data: null, error: null });

  useEffect(() => {
    let live = true;
    api('/api/account/overview', { authToken: token })
      .then((data) => live && setState({ phase: 'ready', data, error: null }))
      .catch((error) => { if (!live) return; if (error.status === 401) forget('shopper'); else setState({ phase: 'error', data: null, error }); });
    return () => { live = false; };
  }, [token, forget]);

  if (state.phase === 'loading') return <Shell><LoadingBlock label="Loading your account…" cards={3} /></Shell>;
  if (state.phase === 'error') return <Shell><h1 className={H1}>We could not load your account</h1><ErrorNote error={state.error} className="mt-6 max-w-xl" /><div className="mt-8"><Button onClick={() => window.location.reload()}>Try again</Button></div></Shell>;

  const { account, skin, skinHistory, preferences, photos, looks, keptUntil } = state.data;
  const hasPhotos = photos.selfie || photos.body;
  return (
    <Shell>
      <h1 className={H1}>{account.name ? `Hello, ${account.name.split(' ')[0]}` : 'Your account'}</h1>
      <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-ink-soft">Signed in as {account.email}. Your colours, looks and details are kept here{keptUntil ? ` until ${day(keptUntil)} (it moves forward every time you visit)` : ''}, or until you delete them.</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button to={skin ? '/looks' : '/start'}>{skin ? 'Plan new looks' : 'Start with my photos'}</Button>
        <Button to="/my-looks" variant="secondary">My looks ({looks.count})</Button>
        <Button variant="secondary" onClick={() => signOut('shopper')}>Sign out</Button>
      </div>

      <div className="mt-10 space-y-6">
        <Panel id="skin-title" title="Skin tone and colours" action={skin && <Link to="/profile" className="text-[14px] text-rani underline underline-offset-4">See full colour profile</Link>}>
          {skin ? (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-3"><span className="size-14 rounded-full border border-line" style={{ backgroundColor: skin.skin.hex }} aria-hidden="true" /><div><p className="font-mono text-[14px]">{skin.skin.hex}</p><p className="text-[13px] text-ink-soft">read {day(skin.analysedAt)}</p></div></div>
              <dl className="grid gap-x-8 gap-y-1 text-[15px] sm:grid-cols-2"><div><dt className="text-ink-soft">Depth</dt><dd>{skin.depth.label}</dd></div><div><dt className="text-ink-soft">Undertone</dt><dd>{skin.undertone.label}</dd></div></dl>
            </div>
          ) : <p className="text-[15px] text-ink-soft">No reading yet. Add a selfie and we read your skin tone.</p>}
          {skinHistory.length > 1 && (
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="text-[15px] font-medium">Earlier readings</h3>
              <ul className="mt-2 space-y-2 text-[14px] text-ink-soft">
                {skinHistory.slice(1).map((h, i) => <li key={i} className="flex items-center gap-3"><span className="size-5 rounded-full border border-line" style={{ backgroundColor: h.skinHex }} aria-hidden="true" />{day(h.analysedAt)} · {cap(h.depth)}, {h.undertone} undertone{h.source === 'sample' ? ' (sample model)' : ''}</li>)}
              </ul>
            </div>
          )}
        </Panel>

        <Panel id="looks-title" title="Your looks" action={looks.count > 0 && <Link to="/my-looks" className="text-[14px] text-rani underline underline-offset-4">Open all</Link>}>
          {looks.count === 0 ? <p className="text-[15px] text-ink-soft">No looks yet. Plan some and choose “See it on me”: they are saved here.</p> : (
            <ul className="divide-y divide-line">
              {looks.latest.map((l) => <li key={l.id} className="flex items-center justify-between gap-4 py-3 text-[15px]"><Link to={`/looks/${l.id}`} className="min-w-0 truncate text-rani underline underline-offset-4">{l.outfit ?? 'Look'}</Link><span className="shrink-0 text-ink-soft">{l.totalPrice != null ? `${rupees(l.totalPrice)} · ` : ''}{day(l.createdAt)}</span></li>)}
            </ul>
          )}
        </Panel>

        <Panel id="prefs-title" title="Your details" action={<Link to="/start?step=details" className="text-[14px] text-rani underline underline-offset-4">Change</Link>}>
          {preferences ? (
            <dl className="grid gap-x-8 gap-y-2 text-[15px] sm:grid-cols-2">
              <div><dt className="text-ink-soft">Occasion</dt><dd>{preferences.occasion === 'other' ? preferences.occasionText : cap(preferences.occasion.replace(/-/g, ' '))}</dd></div>
              <div><dt className="text-ink-soft">Budget</dt><dd>{rupees(preferences.budgetInr)}</dd></div>
              <div><dt className="text-ink-soft">Metal</dt><dd>{cap(preferences.metal || 'any')}</dd></div>
              <div><dt className="text-ink-soft">Silhouettes</dt><dd>{preferences.silhouettes?.length ? preferences.silhouettes.map((s) => cap(s.replace(/-/g, ' '))).join(', ') : 'Any'}</dd></div>
            </dl>
          ) : <p className="text-[15px] text-ink-soft">Not set yet.</p>}
        </Panel>

        <Panel id="photos-title" title="Photos" action={<Link to="/start?step=photos" className="text-[14px] text-rani underline underline-offset-4">{hasPhotos ? 'Change' : 'Add'}</Link>}>
          <p className="text-[15px] text-ink-soft">
            {!hasPhotos ? 'No photos saved.' : `Selfie: ${photos.selfie ? (photos.selfie.source === 'sample' ? 'sample model' : 'your photo') : 'none'}. Full-length: ${photos.body ? (photos.body.source === 'sample' ? 'sample model' : 'your photo') : 'none'}.`}
            {' '}Your photos are stored privately, only to draw your looks, and are never shown to retailers.
          </p>
        </Panel>

        <Panel id="settings-title" title="Account settings">
          <AccountSettings token={token} deleteLabel="Delete my account and everything saved" deleteWarning="This deletes your account, your photos, your skin readings and all your looks." onGone={() => forget('shopper')} />
        </Panel>
      </div>
    </Shell>
  );
}

export default function Account() {
  const { shopper, ready } = useAuth();
  if (!ready) return <Shell><LoadingBlock label="Checking your sign-in…" cards={2} /></Shell>;
  return shopper.token ? <SignedIn /> : <SignedOut />;
}
