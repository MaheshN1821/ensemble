import { TYPE_LABEL, rupees } from '../../lib/format.js';
import ZoomImage from '../ui/ZoomImage.jsx';

const STATUS_TEXT = { idle: 'Not started', queued: 'Waiting', running: 'Drawing now', done: 'Done', failed: 'Did not finish' };
// Text and a symbol always go with the status, so colour never carries the meaning alone.
const STATUS_MARK = { idle: '–', queued: '…', running: '…', done: '✓', failed: '!' };

export function unitText(s) {
  if (s.status !== 'done') return null;
  if (s.cached) return 'Reused from earlier, 0 units';
  const n = `${s.units} ${s.units === 1 ? 'unit' : 'units'}${s.unitsKnown ? '' : ' (estimated)'}`;
  return s.durationMs ? `${n}, ${Math.max(1, Math.round(s.durationMs / 1000))} s` : n;
}

/** One picture, or a quiet placeholder that says what is happening. Every picture carries the AI preview label. */
function Panel({ title, image, stages, label, aspect }) {
  const working = stages.find((s) => s.status === 'running') ?? stages.find((s) => s.status === 'queued');
  const failed = stages.some((s) => s.status === 'failed');
  return (
    <figure className="m-0 overflow-hidden rounded-2xl border border-line bg-paper">
      <div className={`relative ${aspect} bg-mist`}>
        {image ? (
          <ZoomImage src={image.url} alt={image.alt} caption={label} aspect="size-full" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
            <span className={`flex gap-1.5 ${working ? 'arch-pulse' : ''}`} aria-hidden="true">
              {[18, 28, 22].map((h, i) => <span key={i} className="w-4 rounded-t-full bg-ink/70" style={{ height: h }} />)}
            </span>
            <p className="text-[15px] text-ink-soft">
              {working ? working.doing : failed ? 'This panel did not finish. See the steps below.' : 'Not drawn yet'}
            </p>
          </div>
        )}
      </div>
      <p className="border-t border-line px-4 py-2.5 text-[14px] font-medium">{title}</p>
    </figure>
  );
}

export default function LookResult({ look }) {
  const bodyStages = look.stages.filter((s) => s.panel === 'body');
  const faceStages = look.stages.filter((s) => s.panel === 'face');
  const announce = look.stages.map((s) => `${s.label}: ${STATUS_TEXT[s.status].toLowerCase()}`).join('. ');
  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="Outfit on your photo" image={look.images.body} stages={bodyStages} label={look.label} aspect="aspect-[3/4]" />
        <Panel title={faceStages.length ? 'Close-up with jewellery and lipstick' : 'Close-up'} image={look.images.face} stages={faceStages} label={look.label} aspect="aspect-[3/4]" />
      </div>
      <p className="mt-3 text-[13px] text-ink-soft">{look.label}</p>
    </div>
  );
}

export function StageList({ look }) {
  return (
    <section aria-labelledby="steps-h" className="mt-10">
      <h2 id="steps-h" className="text-[20px] font-medium tracking-[-0.02em]">What was drawn</h2>
      <ol className="mt-4 divide-y divide-line border-y border-line">
        {look.stages.map((s) => (
          <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5 text-[15px]">
            <span>
              <span aria-hidden="true" className="mr-2 inline-block w-4 text-center font-mono">{STATUS_MARK[s.status]}</span>
              <span className="font-medium">{s.label}</span>
              <span className="text-ink-soft">: {s.item.name}</span>
            </span>
            <span className="text-ink-soft">
              {STATUS_TEXT[s.status]}
              {unitText(s) && <span className="font-mono text-[13px]"> · {unitText(s)}</span>}
            </span>
            {s.error && <p className="basis-full pl-6 text-[14px] text-alert">{s.error.message}</p>}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[14px] text-ink-soft">
        Units spent on this look: <span className="font-mono">{look.unitsSpent}</span>. Drawing it again costs nothing: finished steps are kept for this session.
      </p>
    </section>
  );
}

export function ItemList({ look }) {
  const items = ['outfit', 'necklace', 'earrings', 'lipstick'].map((s) => look.items[s]).filter(Boolean);
  return (
    <section aria-labelledby="items-h" className="mt-10">
      <h2 id="items-h" className="text-[20px] font-medium tracking-[-0.02em]">In this look</h2>
      <ul className="mt-4 divide-y divide-line border-y border-line text-[15px]">
        {items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3">
            <span><span className="text-ink-soft">{TYPE_LABEL[i.type]}: </span>{i.name}{i.seller && <span className="text-ink-soft"> · {i.seller}</span>}</span>
            <span className="flex items-baseline gap-4">
              <span className="font-mono text-[13px]">{rupees(i.price)}</span>
              {i.productUrl && <a href={i.productUrl} target="_blank" rel="noopener noreferrer" className="text-rani underline underline-offset-2 hover:text-rani-deep">View product<span className="sr-only"> (opens in a new tab)</span></a>}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[15px]">Total {rupees(look.totalPrice)} of your {rupees(look.budgetInr)} budget.</p>
    </section>
  );
}
