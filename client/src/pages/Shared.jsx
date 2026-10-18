import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, apiUrl } from '../lib/api.js';
import { TYPE_LABEL, rupees } from '../lib/format.js';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import Button from '../components/Button.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] sm:text-[44px]';

/** A look someone chose to share. Public and read-only: two pictures and the items. No account, no profile, no reasons. */
export default function Shared() {
  const { token } = useParams();
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let live = true;
    api(`/api/share/${encodeURIComponent(token)}`).then((out) => live && setState({ phase: 'ready', look: out.look })).catch((error) => live && setState({ phase: 'error', error }));
    return () => { live = false; };
  }, [token]);

  if (state.phase === 'loading') return <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8"><LoadingBlock label="Opening the look…" /></section>;
  if (state.phase === 'error') {
    const gone = state.error?.code === 'SHARE_EXPIRED';
    return (
      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <h1 className={H1}>{gone ? 'This link has expired' : 'We could not open this look'}</h1>
        <p className="mt-4 max-w-[56ch] text-[17px] leading-relaxed text-ink-soft">{gone ? 'Share links last 24 hours, and end sooner if the person deletes their data.' : state.error?.message}</p>
        {!gone && <ErrorNote error={state.error} className="mt-6 max-w-xl" />}
        <div className="mt-8"><Button to="/start">Plan a look of your own</Button></div>
      </section>
    );
  }
  const { look } = state;
  const img = (panel, alt) => (
    <figure className="m-0 overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="relative aspect-[3/4] bg-mist">
        <img src={apiUrl(`/api/share/${encodeURIComponent(token)}/image/${panel}`)} alt={alt} className="size-full object-contain" />
        <figcaption className="absolute inset-x-0 bottom-0 bg-ink/85 px-3 py-2 text-[12px] leading-snug text-white">{look.label}</figcaption>
      </div>
    </figure>
  );
  return (
    <section className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className={H1}>A look from Ensemble</h1>
      <p className="mt-4 max-w-[56ch] text-[17px] leading-relaxed text-ink-soft">Shared by its owner. This link works until {new Date(look.expiresAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {look.hasBody && img('body', look.alt.body)}
        {look.hasFace && img('face', look.alt.face)}
      </div>
      <p className="mt-3 text-[13px] text-ink-soft">{look.label}</p>
      <h2 className="mt-10 text-[20px] font-medium tracking-[-0.02em]">In this look</h2>
      <ul className="mt-4 divide-y divide-line border-y border-line text-[15px]">
        {look.items.map((i) => (
          <li key={`${i.type}-${i.name}`} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3">
            <span><span className="text-ink-soft">{TYPE_LABEL[i.type]}: </span>{i.name}</span>
            <span className="flex items-baseline gap-4">
              <span className="font-mono text-[13px]">{rupees(i.price)}</span>
              {i.productUrl && <a href={i.productUrl} target="_blank" rel="noopener noreferrer" className="text-rani underline underline-offset-2 hover:text-rani-deep">View product<span className="sr-only"> (opens in a new tab)</span></a>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[15px]">Total {rupees(look.totalPrice)}.</p>
      <div className="mt-10"><Button to="/start">Plan a look of your own</Button></div>
    </section>
  );
}
