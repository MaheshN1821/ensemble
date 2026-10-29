import { useId } from 'react';

/** A labelled text input. `error` is shown under it and linked for screen readers. */
export default function Field({ label, hint, error, value, onChange, type = 'text', autoComplete, required, className = '', ...rest }) {
  const id = useId();
  const described = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="text-[15px] font-medium">{label}{required === false && <span className="ml-1.5 font-normal text-ink-soft">(optional)</span>}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={described}
        className={`mt-2 h-12 w-full rounded-xl border bg-paper px-4 text-[16px] ${error ? 'border-alert' : 'border-line'}`}
        {...rest}
      />
      {hint && <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-ink-soft">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1.5 text-[14px] text-alert">{error}</p>}
    </div>
  );
}
