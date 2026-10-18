import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';

const slots = [
  { name: 'Outfit', note: 'on your full-length photo', fill: 'bg-rani', height: 'h-[236px] sm:h-[300px]', delay: '0ms' },
  { name: 'Jewellery', note: 'on your selfie', fill: 'bg-peacock', height: 'h-[304px] sm:h-[388px]', delay: '90ms' },
  { name: 'Lipstick', note: 'in a shade for your undertone', fill: 'bg-zari', height: 'h-[264px] sm:h-[336px]', delay: '180ms' },
];

function Triptych() {
  return (
    <div role="img" aria-label="Illustration of three arches: outfit, jewellery and lipstick">
      {/* The arches share one ground line; captions sit in a second row so they stay aligned. */}
      <div className="grid grid-cols-3 items-end gap-3 border-b border-ink/25 sm:gap-4" aria-hidden="true">
        {slots.map((s) => (
          <div
            key={s.name}
            className={`arch-rise relative w-full rounded-t-full ${s.fill} ${s.height}`}
            style={{ animationDelay: s.delay }}
          >
            <div className="absolute inset-[9px] rounded-t-full border border-white/45 sm:inset-3" />
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 sm:gap-4">
        {slots.map((s) => (
          <p key={s.name}>
            <span className="block text-[15px] font-medium">{s.name}</span>
            <span className="block text-[13px] leading-snug text-ink-soft">{s.note}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

const steps = [
  { title: 'Add two photos', body: 'A selfie and a full-length photo. Or try a sample model first.' },
  { title: 'Say what it is for', body: 'Pick the occasion and set a budget in rupees.' },
  { title: 'Choose a look', body: 'Three looks within budget, each with a price and the reasons behind it.' },
  { title: 'Refine it in your words', body: 'Ask for less formal or a warmer lipstick. Only the changed parts are redrawn.' },
];

const promises = [
  { title: 'Your budget is a hard limit', body: 'If nothing fits, we say so and show exactly what we relaxed.' },
  { title: 'Every pick explains itself', body: 'You see which styling rules applied, not just a score.' },
  { title: 'Previews are labelled', body: 'Every image is marked as an AI preview, and so are our sample models.' },
  { title: 'Photos do not stay', body: 'No account. Photos are deleted within 24 hours, or the moment you ask.' },
];

export default function Landing() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-end gap-14 px-5 pb-6 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.08fr_1fr] lg:gap-20 lg:pt-24">
        <div className="pb-2">
          <h1 className="max-w-[16ch] text-[44px] font-light leading-[1.02] tracking-[-0.04em] sm:text-[64px] lg:text-[72px]">
            See the whole look on you before you buy any of it.
          </h1>
          <p className="mt-7 max-w-[46ch] text-[18px] leading-relaxed text-ink-soft">
            Share a selfie and a full-length photo, name the occasion and your budget. Ensemble plans the
            outfit, jewellery and lipstick together and shows them on your own photos.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button to="/start">Start with my photos</Button>
            <Button to="/start" variant="secondary">Try a sample model</Button>
          </div>
          <p className="mt-5 text-sm text-ink-soft">No account. Photos are deleted within 24 hours.</p>
        </div>
        <Triptych />
      </section>

      <section id="how" className="mx-auto mt-28 max-w-6xl scroll-mt-8 px-5 sm:mt-36 sm:px-8">
        <h2 className="max-w-[20ch] text-[32px] font-light leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
          From two photos to a look you can picture yourself in.
        </h2>
        <ol className="mt-12 grid gap-x-10 gap-y-10 border-t border-line pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title}>
              <span className="text-sm font-medium text-rani">Step {i + 1}</span>
              <h3 className="mt-2 text-[19px] font-medium tracking-[-0.01em]">{s.title}</h3>
              <p className="mt-2 max-w-[32ch] text-[15px] leading-relaxed text-ink-soft">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-28 max-w-6xl px-5 sm:mt-36 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <h2 className="max-w-[14ch] text-[32px] font-light leading-[1.1] tracking-[-0.03em] sm:text-[44px]">
            Plain about what it does.
          </h2>
          <dl className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
            {promises.map((p) => (
              <div key={p.title} className="border-t border-line pt-5">
                <dt className="text-[18px] font-medium tracking-[-0.01em]">{p.title}</dt>
                <dd className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-ink-soft">{p.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="open-h" className="mx-auto mt-28 max-w-6xl px-5 sm:mt-36 sm:px-8">
        <div className="grid gap-8 rounded-3xl bg-ink p-8 text-white sm:p-12 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <div>
            <h2 id="open-h" className="max-w-[18ch] text-[30px] font-light leading-[1.1] tracking-[-0.03em] sm:text-[40px]">Nothing hidden: every call and its cost.</h2>
            <p className="mt-4 max-w-[46ch] text-[16px] leading-relaxed text-white/80">Open &ldquo;Under the hood&rdquo; at any time to see each step, how long it took and the units it used. Retailers can bring a catalog and see how shoppers use it.</p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link to="/start" className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-medium text-ink transition-colors hover:bg-mist">Start with a sample model</Link>
            <Link to="/retailer" className="inline-flex h-12 items-center justify-center rounded-full border border-white/40 px-6 text-[15px] font-medium text-white transition-colors hover:border-white">For retailers</Link>
          </div>
        </div>
      </section>
    </>
  );
}
