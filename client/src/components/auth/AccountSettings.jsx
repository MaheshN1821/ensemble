import { useState } from 'react';
import { api } from '../../lib/api.js';
import Button from '../Button.jsx';
import Field from './Field.jsx';
import { ErrorNote } from '../intake/fields.jsx';

/** Change password and delete account, shared by retailers and shoppers. `deleteWarning` says exactly what deletion removes. */
export default function AccountSettings({ token, deleteWarning, deleteLabel, onGone }) {
  const [pw, setPw] = useState({ current: '', next: '' });
  const [state, setState] = useState({ busy: false, done: false, error: null });
  const [del, setDel] = useState({ open: false, password: '', busy: false, error: null });
  const fieldError = state.error?.details?.field;

  async function change(e) {
    e.preventDefault();
    setState({ busy: true, done: false, error: null });
    try { await api('/api/auth/password', { method: 'POST', body: pw, authToken: token }); setPw({ current: '', next: '' }); setState({ busy: false, done: true, error: null }); }
    catch (error) { setState({ busy: false, done: false, error }); }
  }
  async function remove(e) {
    e.preventDefault();
    setDel((d) => ({ ...d, busy: true, error: null }));
    try { await api('/api/auth/account', { method: 'DELETE', body: { password: del.password }, authToken: token }); onGone(); }
    catch (error) { setDel((d) => ({ ...d, busy: false, error })); }
  }

  return (
    <>
      <form onSubmit={change} className="max-w-sm space-y-4" noValidate>
        <h3 className="text-[16px] font-medium">Change password</h3>
        <Field label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(v) => setPw((s) => ({ ...s, current: v }))} error={fieldError === 'current' ? state.error.message : undefined} />
        <Field label="New password" type="password" autoComplete="new-password" value={pw.next} onChange={(v) => setPw((s) => ({ ...s, next: v }))} error={fieldError === 'next' ? state.error.message : undefined} />
        <ErrorNote error={state.error && !fieldError ? state.error : null} />
        {state.done && <p role="status" className="text-[15px] text-peacock">✓ Password changed. Other devices were signed out.</p>}
        <Button type="submit" variant="secondary" disabled={state.busy}>{state.busy ? 'Saving…' : 'Change password'}</Button>
      </form>
      <div className="mt-8 border-t border-line pt-6">
        {!del.open ? (
          <Button variant="quiet" className="px-0 text-alert" onClick={() => setDel((d) => ({ ...d, open: true }))}>{deleteLabel}</Button>
        ) : (
          <form onSubmit={remove} className="max-w-sm space-y-4" role="alertdialog" aria-labelledby="del-acct">
            <h3 id="del-acct" className="text-[16px] font-medium">Delete everything?</h3>
            <p className="text-[15px] leading-relaxed text-ink-soft">{deleteWarning} It cannot be undone.</p>
            <Field label="Enter your password to confirm" type="password" autoComplete="current-password" value={del.password} onChange={(v) => setDel((d) => ({ ...d, password: v }))} />
            <ErrorNote error={del.error} />
            <div className="flex gap-3"><Button type="submit" disabled={del.busy || !del.password}>{del.busy ? 'Deleting…' : 'Delete everything'}</Button><Button variant="secondary" onClick={() => setDel({ open: false, password: '', busy: false, error: null })} disabled={del.busy}>Keep my account</Button></div>
          </form>
        )}
      </div>
    </>
  );
}
