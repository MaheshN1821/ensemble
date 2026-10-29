import { useState } from 'react';
import Button from '../Button.jsx';
import { ErrorNote } from './fields.jsx';

/** Two-step so it is never triggered by accident. Always available once a session exists. */
export default function DeleteEverything({ onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <div className="mt-20 border-t border-line pt-8">
      {!confirming ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button variant="quiet" className="px-0" onClick={() => setConfirming(true)}>Delete my photos and data</Button>
          <p className="text-sm text-ink-soft">Removes everything saved for you straight away, including your saved looks if you have an account.</p>
        </div>
      ) : (
        <div role="alertdialog" aria-labelledby="del-title" aria-describedby="del-body" className="max-w-lg rounded-2xl border border-line bg-paper p-6">
          <h2 id="del-title" className="text-[19px] font-medium">Delete everything now?</h2>
          <p id="del-body" className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Your photos, answers, skin reading and looks are removed from our storage. You will start again from the beginning. Your account, if you have one, stays. This cannot be undone.
          </p>
          <ErrorNote error={error} className="mt-4" />
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={run} disabled={busy} autoFocus>{busy ? 'Deleting…' : 'Delete everything'}</Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>Keep my session</Button>
          </div>
        </div>
      )}
    </div>
  );
}
