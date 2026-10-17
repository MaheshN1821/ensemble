import { useId } from 'react';

/** Checkbox with a large hit area. The label is the whole row. */
export function Checkbox({ checked, onChange, children, hint }) {
  const id = useId();
  return (
    <div className="flex gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 shrink-0 cursor-pointer accent-rani"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <label htmlFor={id} className="cursor-pointer text-[16px] leading-snug">
        {children}
        {hint && (
          <span id={`${id}-hint`} className="mt-1 block text-[14px] text-ink-soft">
            {hint}
          </span>
        )}
      </label>
    </div>
  );
}

const chip =
  'inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-paper px-4 text-[15px] transition-colors hover:border-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rani';
const chipOn = 'peer-checked:border-rani peer-checked:bg-rani-wash peer-checked:text-rani-deep';

/** A group of pill choices. `multiple` renders checkboxes, otherwise radios. Selected state shows a tick as well as colour. */
export function ChoiceGroup({ legend, name, options, value, onChange, multiple = false, hint }) {
  const selected = multiple ? value : [value];
  const toggle = (id) => {
    if (!multiple) return onChange(id);
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  return (
    <fieldset>
      <legend className="text-[16px] font-medium">{legend}</legend>
      {hint && <p className="mt-1 text-[14px] text-ink-soft">{hint}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <span key={o.id} className="relative">
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={name}
                checked={on}
                onChange={() => toggle(o.id)}
                className="peer sr-only"
                id={`${name}-${o.id}`}
              />
              <label htmlFor={`${name}-${o.id}`} className={`${chip} ${chipOn}`}>
                {on && (
                  <svg width="14" height="14" viewBox="0 0 14 14" className="mr-1.5 -ml-1" aria-hidden="true">
                    <path d="M2.5 7.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {o.label}
              </label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ErrorNote({ error, className = '' }) {
  if (!error) return null;
  return (
    <p role="alert" className={`rounded-xl bg-alert-wash px-4 py-3 text-[15px] text-alert ${className}`}>
      {error.message || String(error)}
      {error.requestId && <span className="mt-1 block font-mono text-[12px] opacity-80">Reference {error.requestId}</span>}
    </p>
  );
}
