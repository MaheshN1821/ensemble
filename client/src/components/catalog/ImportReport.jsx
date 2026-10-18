const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Row-by-row result of an import. Status is always words and an icon, never colour alone. */
export default function ImportReport({ report }) {
  const t = report.totals;
  const problems = report.rows.filter((r) => r.status === 'rejected' || r.warnings.length);
  return (
    <section aria-labelledby="report-title" className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
      <h2 id="report-title" className="text-[20px] font-medium tracking-[-0.02em]">Import report</h2>
      <p className="mt-2 text-[16px] leading-relaxed">
        {plural(t.imported, 'item', 'items')} imported{t.updated ? `, ${t.updated} updated` : ''}
        {t.removed ? `, ${t.removed} removed` : ''}.{' '}
        {t.rejected > 0 ? `${plural(t.rejected, 'row needs', 'rows need')} fixing.` : 'Every row was accepted.'}
        {t.withWarnings > 0 && ` ${plural(t.withWarnings, 'item has', 'items have')} a warning.`}
      </p>
      {problems.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-[14px]">
            <caption className="sr-only">Rows with problems</caption>
            <thead className="text-ink-soft">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-4 font-normal">Line</th>
                <th scope="col" className="py-2 pr-4 font-normal">Item</th>
                <th scope="col" className="py-2 pr-4 font-normal">Result</th>
                <th scope="col" className="py-2 font-normal">What to fix</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((r) => (
                <tr key={r.line} className="border-b border-line align-top">
                  <td className="py-3 pr-4 font-mono text-[13px]">{r.line}</td>
                  <td className="py-3 pr-4">{r.name || r.id || 'Unnamed'}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {r.status === 'rejected' ? <span className="text-alert">✕ Not imported</span> : <span>! Imported with a warning</span>}
                  </td>
                  <td className="py-3">
                    <ul className="space-y-1">
                      {r.errors.map((e, i) => <li key={`e${i}`}>{e.field && <span className="font-mono text-[12px] text-ink-soft">{e.field}: </span>}{e.message}</li>)}
                      {r.warnings.map((w, i) => <li key={`w${i}`} className="text-ink-soft">{w.field && <span className="font-mono text-[12px]">{w.field}: </span>}{w.message}</li>)}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
