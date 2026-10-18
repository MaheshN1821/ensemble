import { useId, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import Button from '../Button.jsx';
import { ErrorNote } from '../intake/fields.jsx';

/**
 * Uploads a CSV or JSON file. With no `token` it creates a new catalog; with the manage token it adds to (or replaces) one.
 * `onDone(result)` gets the server response; `onReport(report)` gets the report even when the import is rejected.
 */
export default function ImportForm({ token, askName = false, onDone, onReport, submitLabel = 'Import catalog' }) {
  const ids = { file: useId(), name: useId() };
  const fileRef = useRef(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState('append');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!file) { setError({ message: 'Choose a CSV or JSON file first.' }); return; }
    const body = new FormData();
    body.append('file', file);
    if (askName) body.append('name', name);
    if (token) body.append('mode', mode);
    setBusy(true);
    try {
      const out = await api(token ? '/api/catalogs/mine/import' : '/api/catalogs/import', { method: 'POST', body, catalogToken: token });
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
      {askName && (
        <div>
          <label htmlFor={ids.name} className="text-[15px] font-medium">Catalog name</label>
          <input id={ids.name} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="For example, Priya Silks festive edit" className="mt-2 h-12 w-full rounded-xl border border-line bg-paper px-4 text-[16px]" />
        </div>
      )}
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
        <p id={`${ids.file}-hint`} className="mt-2 text-[14px] text-ink-soft">Up to 60 items per file, 512 KB. Images are downloaded from your links, so they must be public.</p>
      </div>
      {token && (
        <fieldset>
          <legend className="text-[15px] font-medium">What should this file do?</legend>
          <div className="mt-2 space-y-2 text-[15px]">
            <label className="flex items-start gap-3"><input type="radio" name="mode" checked={mode === 'append'} onChange={() => setMode('append')} className="mt-1 size-4 accent-rani" /><span>Add to the catalog. Items with the same id are updated.</span></label>
            <label className="flex items-start gap-3"><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-1 size-4 accent-rani" /><span>Replace the catalog. Items missing from this file are removed.</span></label>
          </div>
        </fieldset>
      )}
      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy ? 'Reading your images…' : submitLabel}</Button>
        {busy && <p role="status" className="text-[14px] text-ink-soft">This can take up to a minute for a large file.</p>}
      </div>
    </form>
  );
}
