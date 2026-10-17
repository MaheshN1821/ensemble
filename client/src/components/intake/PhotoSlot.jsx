import { useEffect, useId, useRef, useState } from 'react';
import Button from '../Button.jsx';
import { ErrorNote } from './fields.jsx';
import SelfieCamera from './SelfieCamera.jsx';
import { checkPhoto } from '../../lib/photoChecks.js';

const COPY = {
  selfie: {
    title: 'Selfie',
    help: 'Used for your skin tone, jewellery and lipstick. Front-facing, even light, no filters.',
    choose: 'Choose a selfie',
    shape: 'aspect-square',
  },
  body: {
    title: 'Full-length photo',
    help: 'Used for the outfit. Stand upright with your whole body in the frame, head to feet.',
    choose: 'Choose a full-length photo',
    shape: 'aspect-[3/4]',
  },
};

/**
 * One photo: shows the saved photo (from the server), or lets the person take or choose one.
 * Checks run in the browser first; the server repeats them.
 */
export default function PhotoSlot({ kind, saved, config, onUpload, onRemove, disabled, canUpload }) {
  const copy = COPY[kind];
  const inputId = useId();
  const inputRef = useRef(null);
  const [camera, setCamera] = useState(false);
  const [preview, setPreview] = useState(null); // local object URL while uploading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const handle = async (file) => {
    if (!file) return;
    setError(null);
    setCamera(false);
    const check = await checkPhoto(file, kind, config);
    if (!check.ok) return setError({ message: check.message });
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      await onUpload(kind, file, file.name);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setPreview(null);
    }
  };

  const remove = async () => {
    setError(null);
    setBusy(true);
    try {
      await onRemove(kind);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const shown = preview || saved?.url;
  const isSample = saved?.source === 'sample';

  return (
    <section aria-labelledby={`${inputId}-t`}>
      <h2 id={`${inputId}-t`} className="text-[19px] font-medium tracking-[-0.01em]">{copy.title}</h2>
      <p className="mt-1 max-w-[40ch] text-[14px] leading-relaxed text-ink-soft">{copy.help}</p>

      {camera ? (
        <div className="mt-4">
          <SelfieCamera onCapture={handle} onCancel={() => setCamera(false)} />
        </div>
      ) : (
        <div className="mt-4">
          <div className={`relative w-full max-w-sm overflow-hidden rounded-t-[999px] border border-line bg-paper ${copy.shape}`}>
            {shown ? (
              <img src={shown} alt={isSample ? `${saved.sampleId} placeholder, an AI sample` : `Your ${copy.title.toLowerCase()}`} className="size-full object-cover" />
            ) : (
              <div className="grid size-full place-items-center px-6 text-center text-[14px] text-ink-soft">No photo yet</div>
            )}
            {isSample && (
              <span className="absolute inset-x-0 bottom-0 bg-ink/80 px-3 py-1.5 text-center text-[12px] text-white">AI-generated sample</span>
            )}
            {busy && <div className="absolute inset-0 grid place-items-center bg-paper/80 text-sm" role="status">Saving…</div>}
          </div>

          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ''; }}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            {canUpload ? (
              <>
                <Button variant={saved && !isSample ? 'secondary' : 'primary'} disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
                  {saved && !isSample ? 'Choose a different photo' : copy.choose}
                </Button>
                {kind === 'selfie' && (
                  <Button variant="secondary" disabled={disabled || busy} onClick={() => { setError(null); setCamera(true); }}>
                    Use the camera
                  </Button>
                )}
              </>
            ) : null}
            {saved && <Button variant="quiet" disabled={busy} onClick={remove}>Remove</Button>}
          </div>
        </div>
      )}
      <ErrorNote error={error} className="mt-4 max-w-sm" />
    </section>
  );
}
