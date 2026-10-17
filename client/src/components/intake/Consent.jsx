import { useState } from 'react';
import Button from '../Button.jsx';
import { Checkbox, ErrorNote } from './fields.jsx';

const facts = [
  { title: 'What we collect', body: 'A selfie and a full-length photo, plus the occasion, budget and preferences you enter. No name, email or account.' },
  { title: 'Who sees the photos', body: 'They are sent to the YouCam API (Perfect Corp) to read your skin tone and draw the look on you. We do not use them for anything else.' },
  { title: 'How long they stay', body: 'Deleted within 24 hours, or the moment you press "Delete my photos and data". Photos are never stored in our database.' },
];

export default function Consent({ initial, onAccept }) {
  const [over18, setOver18] = useState(Boolean(initial?.over18));
  const [ownPhotos, setOwnPhotos] = useState(Boolean(initial?.ownPhotos));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onAccept(over18, ownPhotos);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <h1 data-step-heading tabIndex={-1} className="text-[34px] font-light leading-[1.08] tracking-[-0.03em] outline-none sm:text-[44px]">
        Before you add photos
      </h1>
      <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">
        Ensemble works from your own photos, so here is exactly what happens to them.
      </p>

      <dl className="mt-9 border-t border-line">
        {facts.map((f) => (
          <div key={f.title} className="grid gap-1 border-b border-line py-5 sm:grid-cols-[11rem_1fr] sm:gap-8">
            <dt className="text-[16px] font-medium">{f.title}</dt>
            <dd className="max-w-[56ch] text-[15px] leading-relaxed text-ink-soft">{f.body}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-9 grid gap-5">
        <Checkbox checked={over18} onChange={setOver18}>
          I am 18 or older.
        </Checkbox>
        <Checkbox
          checked={ownPhotos}
          onChange={setOwnPhotos}
          hint="Needed to upload your own photos. Leave it unticked to try a sample model instead."
        >
          I will only upload photos of myself.
        </Checkbox>
      </div>

      <ErrorNote error={error} className="mt-6" />

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!over18 || busy}>{busy ? 'Saving…' : 'Agree and continue'}</Button>
        <Button to="/" variant="quiet">Not now</Button>
      </div>
      {!over18 && <p className="mt-3 text-sm text-ink-soft">Tick the 18 or older box to continue.</p>}
    </form>
  );
}
