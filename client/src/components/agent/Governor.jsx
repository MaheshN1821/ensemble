function Meter({ label, used, cap, unit }) {
  const hasCap = typeof cap === 'number' && cap > 0;
  const pct = hasCap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const tone = pct >= 100 ? 'bg-alert' : pct >= 80 ? 'bg-zari' : 'bg-peacock';
  return (
    <div className="min-w-[9rem] flex-1">
      <p className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="text-ink-soft">{label}</span>
        <span className="font-mono text-[13px] text-ink">{used}{hasCap ? ` of ${cap}` : ''}{unit ? ` ${unit}` : ''}</span>
      </p>
      {hasCap && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`${label} used`} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={Math.min(used, cap)}>
          <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

/** Units used against this session's limit (FR-27), plus the other limits that stop spending. The message says what happens at the cap. */
export default function Governor({ governor }) {
  if (!governor) return null;
  return (
    <section aria-label="Spending limits for this session" className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Meter label="Units" used={governor.units.used} cap={governor.units.cap} />
        <Meter label="Drawings" used={governor.renders.used} cap={governor.renders.cap} />
        <Meter label="Changes" used={governor.turns.used} cap={governor.turns.cap} />
      </div>
      {governor.message && (
        <p role="status" className={`mt-3 text-[14px] ${governor.state === 'capped' ? 'text-alert' : 'text-ink'}`}>
          <span aria-hidden="true" className="mr-1.5 font-mono">{governor.state === 'capped' ? '!' : '…'}</span>{governor.message}
        </p>
      )}
      <p className="mt-3 text-[12px] leading-snug text-ink-soft">
        Units are what YouCam charges for each drawing. Reused drawings cost nothing, and a drawing that fails is not charged.
      </p>
    </section>
  );
}
