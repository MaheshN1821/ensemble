import { useState } from 'react';
import Button from '../Button.jsx';
import PhotoSlot from './PhotoSlot.jsx';
import { ErrorNote } from './fields.jsx';

function SamplePicker({ config, state, onChoose }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const current = state.photos.selfie?.source === 'sample' ? state.photos.selfie.sampleId : null;

  const choose = async (id) => {
    setBusy(id);
    setError(null);
    try {
      await onChoose(id);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="sample-title" className="mt-14 border-t border-line pt-10">
      <h2 id="sample-title" className="text-[24px] font-light tracking-[-0.02em]">Or try a sample model</h2>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
        Not ready to share your photos? Pick a sample model to see how Ensemble works. Sample images are AI-generated and labelled as such.
      </p>
      <div className="mt-6 flex flex-wrap gap-6">
        {config.sampleModels.map((m) => {
          const on = current === m.id;
          return (
            <div key={m.id} className="w-40">
              <img src={m.bodyUrl} alt={`${m.label}, an AI-generated sample`} className="aspect-[3/4] w-full rounded-t-[999px] border border-line object-cover" />
              <p className="mt-2 text-[15px] font-medium">{m.label}</p>
              <Button
                variant={on ? 'secondary' : 'primary'}
                className="mt-2 h-10 px-4 text-sm"
                disabled={busy !== null || on}
                aria-pressed={on}
                onClick={() => choose(m.id)}
              >
                {on ? 'Selected' : busy === m.id ? 'Saving…' : 'Use this model'}
              </Button>
            </div>
          );
        })}
      </div>
      <ErrorNote error={error} className="mt-4 max-w-md" />
    </section>
  );
}

export default function Photos({ config, state, actions, onBack, onNext }) {
  const canUpload = Boolean(state.consent?.ownPhotos);
  const ready = Boolean(state.photos.selfie && state.photos.body);

  return (
    <div>
      <h1 data-step-heading tabIndex={-1} className="text-[34px] font-light leading-[1.08] tracking-[-0.03em] outline-none sm:text-[44px]">
        Add your photos
      </h1>
      <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">
        Two photos: a close-up and a full-length. JPG or PNG, under 10 MB each.
      </p>
      {!canUpload && (
        <p className="mt-5 max-w-[52ch] rounded-xl bg-zari-wash px-4 py-3 text-[15px] text-ink">
          You did not confirm these are your own photos, so uploads are off. Go back to change that, or pick a sample model below.
        </p>
      )}

      <div className="mt-10 grid gap-14 md:grid-cols-2">
        <PhotoSlot kind="selfie" saved={state.photos.selfie} config={config} canUpload={canUpload} onUpload={actions.uploadPhoto} onRemove={actions.removePhoto} />
        <PhotoSlot kind="body" saved={state.photos.body} config={config} canUpload={canUpload} onUpload={actions.uploadPhoto} onRemove={actions.removePhoto} />
      </div>

      <SamplePicker config={config} state={state} onChoose={actions.chooseSample} />

      <div className="mt-12 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button onClick={onNext} disabled={!ready}>Continue</Button>
        {!ready && <p className="text-sm text-ink-soft">Add both photos, or choose a sample model.</p>}
      </div>
    </div>
  );
}
