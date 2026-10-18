/**
 * A quiet loading state in the app's own motif: three arches that breathe in turn. It says what is loading, in text, for
 * screen readers too. `cards` adds placeholder blocks so the page does not jump when content arrives.
 */
export default function LoadingBlock({ label = 'Loading…', cards = 0, className = '' }) {
  return (
    <div role="status" className={className}>
      <div className="flex items-center gap-3 text-ink-soft">
        <span className="flex items-end gap-1" aria-hidden="true">
          {[14, 22, 18].map((h, i) => <span key={i} className="arch-pulse w-3 rounded-t-full bg-ink/70" style={{ height: h, animationDelay: `${i * 160}ms` }} />)}
        </span>
        <p className="text-[16px]">{label}</p>
      </div>
      {cards > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: cards }, (_, i) => <div key={i} className="arch-pulse h-64 rounded-2xl border border-line bg-paper" style={{ animationDelay: `${i * 120}ms` }} />)}
        </div>
      )}
    </div>
  );
}
