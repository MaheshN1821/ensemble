import { useCallback, useEffect, useRef } from 'react';
import { useSession } from '../hooks/useSession.js';
import { useSkinProfile } from '../hooks/useSkinProfile.js';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import Button from '../components/Button.jsx';
import Analysing from '../components/profile/Analysing.jsx';
import Adjust from '../components/profile/Adjust.jsx';
import { SwatchRow } from '../components/profile/Swatch.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] outline-none sm:text-[44px]';
const H2 = 'text-[22px] font-medium tracking-[-0.02em]';

// Metal dots are data colours, like the palette swatches. The name is always shown beside them.
const METAL_DOT = { gold: 'var(--color-zari)', silver: '#B4B7C0', 'rose-gold': '#C98B7A' };
const METAL_NAME = { gold: 'Gold', silver: 'Silver', 'rose-gold': 'Rose gold' };

function Shell({ children }) {
  return <section className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">{children}</section>;
}

function Block({ title, children }) {
  return (
    <section className="border-t border-line py-8">
      <h2 className={H2}>{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Fact({ term, children, detail }) {
  return (
    <div className="grid gap-1 border-b border-line py-5 sm:grid-cols-[11rem_1fr] sm:items-baseline sm:gap-8">
      <dt className="text-[15px] text-ink-soft">{term}</dt>
      <dd>
        <div className="text-[20px] font-light tracking-[-0.01em]">{children}</div>
        {detail && <p className="mt-1 max-w-[52ch] text-[14px] leading-relaxed text-ink-soft">{detail}</p>}
      </dd>
    </div>
  );
}

export function Ready({ intake, profile, options, adjusting, adjustError, setOverride, clearOverride }) {
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);

  const sample = profile.source === 'sample';
  const selfie = intake.photos.selfie;
  const { palette, undertone, depth } = profile;

  const changed = (x) => profile.overridden && x.id !== x.detected;

  return (
    <div>
      <h1 ref={heading} tabIndex={-1} className={H1}>Your colour profile</h1>
      <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">
        {sample
          ? 'Read from the sample model. Nothing was sent to YouCam.'
          : 'Read from your selfie by the YouCam API. These colours guide every item we pick for you.'}
      </p>

      <div className="mt-9 flex items-end gap-6">
        {selfie?.url && (
          <div className="aspect-square w-28 shrink-0 overflow-hidden rounded-t-full border border-line">
            <img src={selfie.url} alt={sample ? 'Sample model selfie' : 'Your selfie'} className="size-full object-cover" />
          </div>
        )}
        <div className="flex items-center gap-3 pb-1">
          <span className="size-12 rounded-full border border-line" style={{ backgroundColor: profile.skin.hex }} aria-hidden="true" />
          <div className="leading-tight">
            <p className="text-[14px] text-ink-soft">Skin colour we read</p>
            <p className="mt-0.5 font-mono text-[14px]">{profile.skin.hex}</p>
          </div>
        </div>
      </div>

      <dl className="mt-8 border-t border-line">
        <Fact term="Depth" detail={changed(depth) ? `You changed this from ${depth.detectedLabel.toLowerCase()}.` : palette.depthNote}>
          {depth.label}
        </Fact>
        <Fact term="Undertone" detail={changed(undertone) ? `You changed this from ${undertone.detectedLabel.toLowerCase()}.` : undertone.confidenceText}>
          {undertone.label}
        </Fact>
      </dl>

      <Adjust profile={profile} options={options} busy={adjusting} error={adjustError} onChange={setOverride} onReset={clearOverride} />

      <div className="mt-10">
        <Block title="Colours that suit you">
          <SwatchRow items={palette.best} label="Colours that suit you" />
          {palette.skippedForYou.length > 0 && (
            <p className="mt-5 text-[14px] text-ink-soft">Left out because you chose to avoid: {palette.skippedForYou.join(', ').toLowerCase()}.</p>
          )}
        </Block>

        {palette.careful.length > 0 && (
          <Block title="Wear with care">
            <p className="mb-5 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">These can still work. We lead with the colours above and use these less often.</p>
            <SwatchRow items={palette.careful} label="Colours to wear with care" />
          </Block>
        )}

        <Block title="Jewellery metal">
          <ul className="flex flex-wrap gap-x-6 gap-y-3" aria-label="Metals that suit you">
            {[palette.metals.primary, palette.metals.secondary].map((m, i) => (
              <li key={m} className="flex items-center gap-2.5 text-[16px]">
                <span className="size-5 rounded-full border border-line" style={{ backgroundColor: METAL_DOT[m] }} aria-hidden="true" />
                {METAL_NAME[m]}
                <span className="text-[14px] text-ink-soft">{i === 0 ? '(first pick)' : '(also works)'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">{palette.metals.note}</p>
        </Block>

        <Block title="Lipstick shades">
          <SwatchRow items={palette.lips} label="Lipstick shades for your try-on" />
          <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">The try-on will apply one of these, matched to your depth and undertone.</p>
        </Block>

        <details className="border-t border-line py-6">
          <summary className="cursor-pointer text-[15px] text-ink-soft hover:text-ink">How we read this</summary>
          <div className="mt-4 max-w-[60ch] space-y-3 text-[15px] leading-relaxed text-ink-soft">
            <p>
              {sample
                ? 'The sample model has a fixed skin colour. It goes through the same rules as a real photo.'
                : 'YouCam measures the colour of your skin in the selfie. We then turn that colour into a depth and an undertone with fixed rules, not a language model.'}
            </p>
            <p>Lighting changes colour. A selfie in warm indoor light can read warmer than you are, and shade can read deeper. Even daylight gives the best reading.</p>
            <p className="font-mono text-[13px] text-ink">
              L* {profile.measure.L} · a* {profile.measure.a} · b* {profile.measure.b} · hue {profile.measure.hue}° · chroma {profile.measure.chroma} · ITA {profile.measure.ita}°
            </p>
            {!sample && (
              <p className="text-[14px]">
                {profile.cached ? 'Saved from earlier in this session, so no extra cost. ' : ''}
                {profile.unitsKnown ? `${profile.units} API units used.` : `About ${profile.units} API units used (estimated price).`}
              </p>
            )}
          </div>
        </details>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button to="/looks">See my looks</Button>
        <Button to="/start" variant="secondary">Change my details</Button>
      </div>
      <p className="mt-5 max-w-[52ch] text-[14px] text-ink-soft">Next, we plan three looks from the catalog that match this profile, your occasion and your budget.</p>
    </div>
  );
}

export default function Profile() {
  const { session, error: sessionError, retry: retrySession, reset } = useSession();
  const onSessionLost = useCallback(() => reset(), [reset]);
  const p = useSkinProfile(session?.sessionId, { onSessionLost });

  if (sessionError) {
    return (
      <Shell>
        <h1 className={H1}>We could not start your session</h1>
        <ErrorNote error={sessionError} className="mt-6 max-w-xl" />
        <div className="mt-8"><Button onClick={retrySession}>Try again</Button></div>
      </Shell>
    );
  }

  if (p.phase === 'loading') {
    return <Shell><LoadingBlock label="Getting ready…" /></Shell>;
  }

  if (p.phase === 'incomplete') {
    return (
      <Shell>
        <h1 className={H1}>Finish your details first</h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">We need your selfie, full-length photo, occasion and budget before we can read your colours.</p>
        <div className="mt-8"><Button to="/start">Continue your details</Button></div>
      </Shell>
    );
  }

  if (p.phase === 'analysing') {
    return <Shell><Analysing sample={p.intake?.photos?.selfie?.source === 'sample'} /></Shell>;
  }

  if (p.phase === 'error') {
    const retake = p.error?.code === 'SELFIE_UNUSABLE';
    return (
      <Shell>
        <h1 className={H1}>{retake ? 'We could not read that selfie' : 'We could not read your skin tone'}</h1>
        <ErrorNote error={p.error} className="mt-6 max-w-xl" />
        <div className="mt-8 flex flex-wrap gap-3">
          {retake ? <Button to="/start?step=photos">Choose another selfie</Button> : <Button onClick={p.retry}>Try again</Button>}
          <Button to="/start" variant="secondary">Change my details</Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Ready {...p} />
    </Shell>
  );
}
