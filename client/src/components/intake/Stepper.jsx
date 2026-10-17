const STEPS = [
  { id: 'consent', label: 'Consent' },
  { id: 'photos', label: 'Photos' },
  { id: 'details', label: 'Occasion and budget' },
  { id: 'review', label: 'Review' },
];

/** Four segments. The current step is named in text, so colour is never the only signal. */
export default function Stepper({ current }) {
  const index = STEPS.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Progress">
      <p className="text-sm text-ink-soft">
        Step {index + 1} of {STEPS.length}: <span className="font-medium text-ink">{STEPS[index].label}</span>
      </p>
      <ol className="mt-3 grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            aria-current={i === index ? 'step' : undefined}
            className={`h-1 rounded-full ${i < index ? 'bg-peacock' : i === index ? 'bg-rani' : 'bg-line'}`}
          >
            <span className="sr-only">{s.label}{i < index ? ' (done)' : ''}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
