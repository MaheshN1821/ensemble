import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';
import Button from '../Button.jsx';
import { Checkbox, ErrorNote } from '../intake/fields.jsx';
import Field from './Field.jsx';

const BLANK = { email: '', password: '', name: '', businessName: '', phone: '', city: '', website: '', gstin: '', accept: false };

/**
 * Sign in or create an account, for a retailer (business details collected) or a shopper (email and password only).
 * `onDone(result, mode)` runs after success. A rejected field is highlighted under its input.
 */
export default function AuthForm({ role, initialMode = 'login', onDone }) {
  const { signIn } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [v, setV] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (val) => setV((s) => ({ ...s, [k]: val }));
  const retailer = role === 'retailer';
  const register = mode === 'register';
  const fieldError = error?.details?.field;
  const errFor = (k) => (fieldError === k ? error.message : undefined);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let body = { email: v.email, password: v.password };
      if (register && retailer) body = { ...body, name: v.name, businessName: v.businessName, phone: v.phone, city: v.city, website: v.website, gstin: v.gstin, acceptTerms: v.accept };
      if (register && !retailer) body = { ...body, name: v.name, acceptRetention: v.accept };
      const out = await signIn(role, mode, body);
      onDone?.(out, mode);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const tab = (m, label) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => { setMode(m); setError(null); }}
      className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-[15px] font-medium transition-colors ${mode === m ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink'}`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div role="tablist" aria-label="Sign in or create an account" className="flex gap-1 rounded-full border border-line bg-mist p-1">
        {tab('login', 'Sign in')}
        {tab('register', 'Create account')}
      </div>

      {register && retailer && (
        <>
          <Field label="Shop or brand name" value={v.businessName} onChange={set('businessName')} autoComplete="organization" error={errFor('businessName')} maxLength={80} hint="Shown to shoppers as “Sold by”." />
          <Field label="Your name" value={v.name} onChange={set('name')} autoComplete="name" error={errFor('name')} maxLength={80} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Phone" type="tel" value={v.phone} onChange={set('phone')} autoComplete="tel" error={errFor('phone')} inputMode="tel" />
            <Field label="City" value={v.city} onChange={set('city')} autoComplete="address-level2" error={errFor('city')} maxLength={60} />
          </div>
          <Field label="Website" required={false} value={v.website} onChange={set('website')} autoComplete="url" error={errFor('website')} placeholder="https://yourshop.in" />
          <Field label="GSTIN" required={false} value={v.gstin} onChange={set('gstin')} error={errFor('gstin')} maxLength={15} hint="15 characters, if you have one." />
        </>
      )}
      {register && !retailer && <Field label="Your name" required={false} value={v.name} onChange={set('name')} autoComplete="name" error={errFor('name')} maxLength={80} />}

      <Field label="Email" type="email" value={v.email} onChange={set('email')} autoComplete="email" error={errFor('email')} inputMode="email" />
      <Field
        label="Password"
        type="password"
        value={v.password}
        onChange={set('password')}
        autoComplete={register ? 'new-password' : 'current-password'}
        error={errFor('password')}
        hint={register ? 'At least 8 characters. Avoid common passwords. There is no email reset yet, so keep it somewhere safe.' : undefined}
      />

      {register && (
        <div>
          <Checkbox checked={v.accept} onChange={set('accept')}>
            {retailer
              ? 'I have the right to use these product photos and details, and I am happy for shoppers to see them in the Ensemble catalog.'
              : 'Keep my photos, skin colour reading and looks in my account until I delete them.'}
          </Checkbox>
          {errFor('acceptTerms') || errFor('acceptRetention') ? <p className="mt-1.5 text-[14px] text-alert">{error.message}</p> : null}
        </div>
      )}

      <ErrorNote error={error && !fieldError ? error : null} />
      <Button type="submit" disabled={busy} className="w-full sm:w-auto">{busy ? 'One moment…' : register ? 'Create account' : 'Sign in'}</Button>
    </form>
  );
}
