import { useId, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import Button from '../Button.jsx';
import { ErrorNote } from '../intake/fields.jsx';

/**
 * A retailer adds a CSV or JSON file to the shared catalog. `onDone(result)` gets the server's answer (the refreshed
 * dashboard and the import report); `onReport(report)` gets the report even when the import is rejected.
 */
export default function ImportForm({ token, onDone, onReport, maxRows = 60, hasItems = false }) {
  const ids = { file: useId() };
  const fileRef = useRef(null);
  const [mode, setMode] = useState('append');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!file) { setError({ message: 'Choose a CSV or JSON file first.' }); return; }
    if (mode === 'replace' && !window.confirm('Replace your whole catalog with this file? Your other items will be deleted from the catalog and from shoppers’ options. This cannot be undone.')) return;
    const body = new FormData();
    body.append('file', file);
    body.append('mode', mode);
    setBusy(true);
    try {
      const out = await api('/api/retailer/uploads', { method: 'POST', body, authToken: token });
      onReport?.(out.report);
      onDone?.(out);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      if (err.details?.report) onReport?.(err.details.report);
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <label htmlFor={ids.file} className="text-[15px] font-medium">CSV or JSON file</label>
        <input
          ref={fileRef}
          id={ids.file}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          aria-describedby={`${ids.file}-hint`}
          className="mt-2 block w-full cursor-pointer rounded-xl border border-line bg-paper p-3 text-[15px] file:mr-4 file:cursor-pointer file:rounded-full file:border-0 file:bg-rani-wash file:px-4 file:py-2 file:text-[14px] file:font-medium file:text-rani-deep"
        />
        <p id={`${ids.file}-hint`} className="mt-2 text-[14px] text-ink-soft">Up to {maxRows} items per file, 512 KB. Images are downloaded from your links, so they must be public. Valid items go live for shoppers straight away.</p>
      </div>
      {hasItems && (
        <fieldset>
          <legend className="text-[15px] font-medium">What should this file do?</legend>
          <div className="mt-2 space-y-2 text-[15px]">
            <label className="flex items-start gap-3"><input type="radio" name="mode" checked={mode === 'append'} onChange={() => setMode('append')} className="mt-1 size-4 accent-rani" /><span>Add to my catalog. Items with the same id are updated.</span></label>
            <label className="flex items-start gap-3"><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-1 size-4 accent-rani" /><span>Replace my catalog. My items missing from this file are deleted.</span></label>
          </div>
        </fieldset>
      )}
      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy ? 'Reading your images…' : 'Upload to catalog'}</Button>
        {busy && <p role="status" className="text-[14px] text-ink-soft">This can take up to a minute for a large file.</p>}
      </div>
    </form>
  );
}
