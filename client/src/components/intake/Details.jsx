import { useId, useState } from 'react';
import Button from '../Button.jsx';
import { ChoiceGroup, ErrorNote } from './fields.jsx';

const inr = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const QUICK = [10000, 25000, 50000, 100000];

const blank = (config) => ({
  occasion: '',
  occasionText: '',
  budgetInr: config.budget.default,
  silhouettes: [],
  metal: 'any',
  avoidColours: [],
  notes: '',
});

export default function Details({ config, saved, onSave, onBack }) {
  const [v, setV] = useState(() => ({ ...blank(config), ...(saved ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState({});
  const budgetId = useId();
  const textId = useId();
  const notesId = useId();
  const set = (patch) => setV((p) => ({ ...p, ...patch }));

  const validate = () => {
    const e = {};
    if (!v.occasion) e.occasion = 'Choose an occasion.';
    if (v.occasion === 'other' && v.occasionText.trim().length < 3) e.occasionText = 'Describe the occasion in a few words.';
    const b = Number(v.budgetInr);
    if (!Number.isFinite(b) || b < config.budget.min || b > config.budget.max) {
      e.budgetInr = `Enter a budget between ${inr(config.budget.min)} and ${inr(config.budget.max)}.`;
    }
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setFieldError(e);
    setError(null);
    if (Object.keys(e).length) {
      document.getElementById(Object.keys(e)[0] === 'budgetInr' ? budgetId : Object.keys(e)[0] === 'occasionText' ? textId : 'occasion-' + config.occasions[0].id)?.focus();
      return;
    }
    setBusy(true);
    try {
      await onSave({ ...v, budgetInr: Math.round(Number(v.budgetInr)) });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const occasions = [...config.occasions, { id: 'other', label: 'Something else' }];

  return (
    <form onSubmit={submit} noValidate>
      <h1 data-step-heading tabIndex={-1} className="text-[34px] font-light leading-[1.08] tracking-[-0.03em] outline-none sm:text-[44px]">
        What is the look for?
      </h1>
      <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">
        Your budget is a hard limit: every look we plan stays within it.
      </p>

      <div className="mt-10 grid gap-10">
        <div>
          <ChoiceGroup legend="Occasion" name="occasion" options={occasions} value={v.occasion} onChange={(occasion) => set({ occasion })} />
          {fieldError.occasion && <p role="alert" className="mt-2 text-[14px] text-alert">{fieldError.occasion}</p>}
          {v.occasion === 'other' && (
            <div className="mt-4 max-w-md">
              <label htmlFor={textId} className="text-[15px] font-medium">Describe the occasion</label>
              <input
                id={textId}
                value={v.occasionText}
                maxLength={config.occasionTextMax}
                onChange={(e) => set({ occasionText: e.target.value })}
                aria-invalid={Boolean(fieldError.occasionText)}
                className="mt-2 h-12 w-full rounded-xl border border-line bg-paper px-4 text-[16px]"
                placeholder="A friend's engagement lunch"
              />
              {fieldError.occasionText && <p role="alert" className="mt-2 text-[14px] text-alert">{fieldError.occasionText}</p>}
            </div>
          )}
        </div>

        <div>
          <label htmlFor={budgetId} className="text-[16px] font-medium">Budget in rupees</label>
          <p className="mt-1 text-[14px] text-ink-soft">For the whole look: outfit, jewellery and lipstick together.</p>
          <div className="mt-3 flex max-w-xs items-center rounded-xl border border-line bg-paper focus-within:border-rani">
            <span className="pl-4 text-[18px] text-ink-soft" aria-hidden="true">₹</span>
            <input
              id={budgetId}
              type="number"
              inputMode="numeric"
              min={config.budget.min}
              max={config.budget.max}
              step={config.budget.step}
              value={v.budgetInr}
              onChange={(e) => set({ budgetInr: e.target.value })}
              aria-invalid={Boolean(fieldError.budgetInr)}
              aria-describedby={`${budgetId}-words`}
              className="h-12 w-full bg-transparent px-2 text-[18px] outline-none"
            />
          </div>
          <p id={`${budgetId}-words`} className="mt-2 text-[14px] text-ink-soft">{Number.isFinite(Number(v.budgetInr)) && v.budgetInr !== '' ? inr(Number(v.budgetInr)) : ''}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => set({ budgetInr: q })}
                className="min-h-10 rounded-full border border-line bg-paper px-4 text-[14px] hover:border-ink"
              >
                {inr(q)}
              </button>
            ))}
          </div>
          {fieldError.budgetInr && <p role="alert" className="mt-2 text-[14px] text-alert">{fieldError.budgetInr}</p>}
        </div>

        <ChoiceGroup
          legend="Outfit styles you would wear"
          name="silhouettes"
          multiple
          options={config.silhouettes}
          value={v.silhouettes}
          onChange={(silhouettes) => set({ silhouettes })}
          hint="Optional. Leave empty to see anything that suits the occasion."
        />
        <ChoiceGroup legend="Jewellery metal" name="metal" options={config.metals} value={v.metal} onChange={(metal) => set({ metal })} />
        <ChoiceGroup
          legend="Colours to avoid"
          name="avoid"
          multiple
          options={config.avoidColours}
          value={v.avoidColours}
          onChange={(avoidColours) => set({ avoidColours })}
          hint="Optional."
        />

        <div className="max-w-xl">
          <label htmlFor={notesId} className="text-[16px] font-medium">Anything else we should know</label>
          <textarea
            id={notesId}
            rows={3}
            maxLength={config.notesMax}
            value={v.notes}
            onChange={(e) => set({ notes: e.target.value })}
            className="mt-2 w-full rounded-xl border border-line bg-paper px-4 py-3 text-[16px]"
            placeholder="Nothing too heavy, I will be on my feet all evening"
          />
          <p className="mt-1 text-[13px] text-ink-soft">{v.notes.length} of {config.notesMax} characters</p>
        </div>
      </div>

      <ErrorNote error={error} className="mt-8" />

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Review my details'}</Button>
      </div>
    </form>
  );
}
