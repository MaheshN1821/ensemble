import { useId, useState } from 'react';
import Governor from './Governor.jsx';
import TracePanel from './TracePanel.jsx';

/** The collapsed "Under the hood" section at the foot of a look. The same panel opens from the header on any page. */
export default function UnderTheHood({ sessionId, governor, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const panel = useId();
  return (
    <section aria-labelledby={`${panel}-h`} className="mt-12 border-t border-line pt-8">
      <h2 id={`${panel}-h`} className="text-[20px] font-medium tracking-[-0.02em]">
        <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((v) => !v)} className="flex min-h-11 items-center gap-2 text-left">
          <span aria-hidden="true" className="inline-block w-4 font-mono text-[16px]">{open ? '−' : '+'}</span>
          Under the hood
        </button>
      </h2>
      {!open && <p className="mt-1 max-w-[60ch] text-[15px] text-ink-soft">See every step, how long it took and what it cost in units.</p>}
      <div id={panel} hidden={!open} className="mt-4">
        <Governor governor={governor} />
        <div className="mt-5"><TracePanel sessionId={sessionId} active={open} /></div>
      </div>
    </section>
  );
}
