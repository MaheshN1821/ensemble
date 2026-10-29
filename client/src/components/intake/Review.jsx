import Button from '../Button.jsx';

const inr = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const labelOf = (list, id) => list.find((x) => x.id === id)?.label ?? id;
const join = (list, ids) => (ids?.length ? ids.map((i) => labelOf(list, i)).join(', ') : null);

function Row({ term, children, onEdit, editLabel }) {
  return (
    <div className="grid gap-1 border-b border-line py-5 sm:grid-cols-[11rem_1fr_auto] sm:items-baseline sm:gap-8">
      <dt className="text-[15px] text-ink-soft">{term}</dt>
      <dd className="text-[16px]">{children}</dd>
      <dd><button type="button" onClick={onEdit} className="text-[15px] text-rani-deep underline underline-offset-4 hover:text-rani" aria-label={editLabel}>Edit</button></dd>
    </div>
  );
}

function Thumb({ photo, alt, ratio }) {
  if (!photo) return null;
  return (
    <div className={`relative w-24 overflow-hidden rounded-t-full border border-line ${ratio}`}>
      <img src={photo.url} alt={alt} className="size-full object-cover" />
    </div>
  );
}

export default function Review({ config, state, onEdit, onBack, onConfirm }) {
  const p = state.preferences;
  const sample = state.photos.selfie?.source === 'sample';
  const occasion = p.occasion === 'other' ? p.occasionText : labelOf(config.occasions, p.occasion);

  return (
    <div>
      <h1 data-step-heading tabIndex={-1} className="text-[34px] font-light leading-[1.08] tracking-[-0.03em] outline-none sm:text-[44px]">
        Check your details
      </h1>
      <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">
        {sample
          ? 'You are using a sample model, so none of your own photos are sent anywhere.'
          : 'When you continue, your photos are sent to the YouCam API to read your skin tone. They are deleted within 24 hours, or kept in your account if you have one.'}
      </p>

      <dl className="mt-9 border-t border-line">
        <Row term="Photos" onEdit={() => onEdit('photos')} editLabel="Edit photos">
          <div className="flex items-end gap-4">
            <Thumb photo={state.photos.selfie} alt={sample ? 'Sample selfie' : 'Your selfie'} ratio="aspect-square" />
            <Thumb photo={state.photos.body} alt={sample ? 'Sample full-length photo' : 'Your full-length photo'} ratio="aspect-[3/4]" />
            {sample && <span className="text-[14px] text-ink-soft">AI-generated sample model</span>}
          </div>
        </Row>
        <Row term="Occasion" onEdit={() => onEdit('details')} editLabel="Edit occasion">{occasion}</Row>
        <Row term="Budget" onEdit={() => onEdit('details')} editLabel="Edit budget">{inr(p.budgetInr)} for the whole look</Row>
        <Row term="Outfit styles" onEdit={() => onEdit('details')} editLabel="Edit outfit styles">{join(config.silhouettes, p.silhouettes) ?? 'Anything that suits the occasion'}</Row>
        <Row term="Jewellery metal" onEdit={() => onEdit('details')} editLabel="Edit jewellery metal">{labelOf(config.metals, p.metal)}</Row>
        <Row term="Colours to avoid" onEdit={() => onEdit('details')} editLabel="Edit colours to avoid">{join(config.avoidColours, p.avoidColours) ?? 'None'}</Row>
        {p.notes && <Row term="Notes" onEdit={() => onEdit('details')} editLabel="Edit notes">{p.notes}</Row>}
      </dl>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button onClick={onConfirm}>Looks right, continue</Button>
      </div>
    </div>
  );
}
