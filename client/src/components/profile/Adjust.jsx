import { ChoiceGroup, ErrorNote } from '../intake/fields.jsx';
import Button from '../Button.jsx';

/** Lets the person correct the reading. Changes save at once; "Use our reading" removes them. */
export default function Adjust({ profile, options, busy, error, onChange, onReset }) {
  return (
    <details className="group mt-8 rounded-2xl border border-line bg-paper" open={profile.overridden || profile.undertone.confidence === 'low' || undefined}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-[16px] font-medium">
        <span>Not quite right? Adjust your profile</span>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180">
          <path d="M2 5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="space-y-7 border-t border-line px-5 py-6">
        <p className="max-w-[56ch] text-[15px] leading-relaxed text-ink-soft">
          Cameras and lighting can shift a reading. If you know your undertone, or the depth looks off, choose what fits and your colours update straight away.
        </p>
        <ChoiceGroup
          legend="Undertone"
          name="undertone"
          options={options.undertones.map((u) => ({ id: u.id, label: u.label }))}
          value={profile.undertone.id}
          onChange={(id) => onChange({ undertone: id })}
          hint={options.undertones.find((u) => u.id === profile.undertone.id)?.blurb}
        />
        <ChoiceGroup legend="Depth" name="depth" options={options.depths} value={profile.depth.id} onChange={(id) => onChange({ depth: id })} />
        <ErrorNote error={error} />
        <div className="flex flex-wrap items-center gap-3">
          {profile.overridden && (
            <Button variant="secondary" onClick={onReset} disabled={busy}>
              Use our reading ({profile.depth.detectedLabel.toLowerCase()}, {profile.undertone.detectedLabel.toLowerCase()})
            </Button>
          )}
          <span role="status" className="text-[14px] text-ink-soft">{busy ? 'Updating your colours…' : ''}</span>
        </div>
      </div>
    </details>
  );
}
