import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { rupees, TYPE_LABEL } from '../../lib/format.js';
import Button from '../Button.jsx';
import { ErrorNote } from '../intake/fields.jsx';

const SOURCE_TEXT = { 'language-model': 'Written by the language model from the planner’s facts.', planner: null };

function Alternatives({ items, onPick, disabled }) {
  if (!items?.length) return null;
  return (
    <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
      {items.map((a) => (
        <li key={a.itemId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-[15px]">
          <span>
            <span className="font-medium">{a.name}</span>
            <span className="text-ink-soft"> · {TYPE_LABEL[a.slot] ?? a.slot} · {rupees(a.price)}</span>
          </span>
          <Button variant="secondary" className="h-10 px-4 text-[14px]" disabled={disabled} onClick={() => onPick(a)} aria-label={`Try ${a.name}`}>Try this</Button>
        </li>
      ))}
    </ul>
  );
}

/** What the last request did: the reply, what changed, what will be drawn, and anything that could not be done. */
function Outcome({ turn }) {
  const hasChange = turn.changes?.length > 0;
  return (
    <div role="status" className="mt-5 rounded-2xl border border-line bg-paper p-5">
      <p className="text-[16px] leading-relaxed">{turn.reply}</p>
      {SOURCE_TEXT[turn.replySource] && <p className="mt-2 text-[12px] text-ink-soft">{SOURCE_TEXT[turn.replySource]}</p>}
      {hasChange && (
        <ul className="mt-4 space-y-1.5 text-[14px]">
          {turn.changes.filter((c) => c.to || c.from).map((c, i) => (
            <li key={`${c.slot}-${i}`} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{TYPE_LABEL[c.slot] ?? c.slot}:</span>
              <span className="text-ink-soft">{c.from ? c.from.name : 'none'}</span>
              <span aria-hidden="true">→</span>
              <span className="sr-only">changed to</span>
              <span>{c.to ? c.to.name : 'removed'}</span>
            </li>
          ))}
        </ul>
      )}
      {turn.draw && (turn.draw.redraw.length > 0 || turn.draw.reused.length > 0) && (
        <p className="mt-4 text-[14px] text-ink-soft">
          {turn.draw.redraw.length > 0 && <>Drawing again: <span className="text-ink">{turn.draw.redraw.join(', ')}</span>{turn.draw.estimatedUnits ? <> (up to <span className="font-mono">{turn.draw.estimatedUnits}</span> {turn.draw.estimatedUnits === 1 ? 'unit' : 'units'})</> : null}. </>}
          {turn.draw.reused.length > 0 && <>Kept from before: {turn.draw.reused.join(', ')}.</>}
        </p>
      )}
      {turn.renderError && (
        <p className={`mt-4 text-[14px] ${turn.renderError.cap ? 'text-alert' : 'text-ink'}`}>
          <span aria-hidden="true" className="mr-1.5 font-mono">!</span>{turn.renderError.message}
          {turn.lookId && <> The new look is saved in <Link className="underline underline-offset-2 hover:text-rani" to={`/looks/${turn.lookId}`}>your looks</Link>.</>}
        </p>
      )}
      {turn.llmNote && <p className="mt-3 text-[13px] text-ink-soft">{turn.llmNote}</p>}
    </div>
  );
}

/**
 * Refine a look in plain words or with one tap (FR-22, FR-23). Chips work with or without a language model.
 * After a change the page moves to the new look, where only the changed parts are drawn again.
 */
export default function Refine({ look, config, turn, busy, error, onSend, onNavigate, disabled }) {
  const [text, setText] = useState('');
  const field = useRef(null);
  const hintId = useId();
  const max = config?.messageMax ?? 300;
  const locked = disabled || busy || look.active;
  const shown = turn?.turn && (turn.turn.lookId === look.id || turn.turn.previousLookId === look.id) ? turn.turn : null;

  useEffect(() => { if (shown && !shown.unchanged) setText(''); }, [shown]);

  const submit = async (body) => {
    const out = await onSend(body);
    if (out?.turn?.lookId && out.turn.lookId !== look.id && !out.turn.unchanged) onNavigate(out.turn.lookId);
  };
  const onSubmit = (e) => { e.preventDefault(); const message = text.trim(); if (message && !locked) submit({ message }); };

  return (
    <section aria-labelledby="refine-h" className="mt-12">
      <h2 id="refine-h" className="text-[20px] font-medium tracking-[-0.02em]">Change this look</h2>
      <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">
        Ask in your own words, or tap an option. Choices always come from the catalog, your budget stays a hard limit, and only the parts that change are drawn again.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Quick changes">
        {(config?.chips ?? []).map((c) => (
          <button key={c.id} type="button" disabled={locked} onClick={() => submit({ chip: c.id })} className="h-10 rounded-full border border-line bg-paper px-4 text-[14px] font-medium transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50">
            {c.label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-5 max-w-2xl">
        <label htmlFor="refine-text" className="text-[14px] font-medium">Or type what you want</label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="refine-text" ref={field} type="text" value={text} maxLength={max} disabled={locked} autoComplete="off"
            onChange={(e) => setText(e.target.value)} aria-describedby={hintId}
            placeholder={config?.examples?.[0] ?? 'Less formal, warmer lipstick'}
            className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-paper px-4 text-[16px] disabled:opacity-60"
          />
          <Button type="submit" disabled={locked || !text.trim()}>{busy ? 'Working on it…' : 'Make the change'}</Button>
        </div>
        <p id={hintId} className="mt-2 text-[13px] text-ink-soft">
          {look.active ? 'Wait for this look to finish drawing first.' : 'For example: '}
          {!look.active && (config?.examples ?? []).slice(0, 3).map((ex, i) => (
            <span key={ex}>{i > 0 && ', '}<button type="button" disabled={locked} onClick={() => { setText(ex); field.current?.focus(); }} className="underline decoration-line underline-offset-2 hover:text-rani disabled:no-underline">{ex}</button></span>
          ))}
        </p>
        {config && !config.llm.available && <p className="mt-1 text-[13px] text-ink-soft">{config.llm.note}</p>}
      </form>

      <ErrorNote error={error} className="mt-4 max-w-xl" />
      {busy && <p role="status" className="mt-4 text-[15px] text-ink-soft">Reading your request and checking it against your budget…</p>}
      {shown && !busy && (
        <>
          <Outcome turn={shown} />
          <Alternatives items={shown.alternatives} disabled={locked} onPick={(a) => submit({ action: { op: 'swap_item', slot: a.slot, itemId: a.itemId } })} />
        </>
      )}
    </section>
  );
}
