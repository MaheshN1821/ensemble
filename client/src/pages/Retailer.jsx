import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import ImportForm from '../components/catalog/ImportForm.jsx';
import ImportReport from '../components/catalog/ImportReport.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] sm:text-[44px]';
const API = import.meta.env.VITE_API_URL || '';

const COLUMNS = [
  ['type', 'outfit, necklace, earrings or lipstick'],
  ['name, price', 'price in whole rupees'],
  ['image_url', 'a public https link to a .jpg or .png. A plain background works best'],
  ['formality', '1 (casual) to 5 (very formal)'],
  ['occasion_tags', 'for example wedding-guest|festive'],
  ['metal_tone', 'necklaces and earrings: gold, silver, rose gold or oxidised'],
  ['colours', 'optional. If blank we read them from the photo'],
];

export default function Retailer() {
  const [result, setResult] = useState(null);
  const [report, setReport] = useState(null);

  function done(out) {
    setResult(out);
    try { sessionStorage.setItem(`ensemble.links.${out.tokens.manage}`, JSON.stringify(out.tokens)); } catch { /* the page still shows them once */ }
  }

  const origin = window.location.origin;
  return (
    <section className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className={H1}>Bring your own catalog</h1>
      <p className="mt-4 max-w-[56ch] text-[17px] leading-relaxed text-ink-soft">
        Upload a spreadsheet of your outfits, jewellery and lipsticks. Shoppers then get complete looks planned from your items. No account needed: you get two private links.
      </p>

      {!result && (
        <>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href={`${API}/api/catalog/template`} variant="secondary">Download CSV template</Button>
            <Button href={`${API}/api/catalog/template?format=json`} variant="secondary">Download JSON template</Button>
          </div>
          <details className="mt-6 border-t border-line py-5">
            <summary className="cursor-pointer text-[15px] text-ink-soft hover:text-ink">What goes in each column</summary>
            <dl className="mt-4 space-y-2 text-[15px]">
              {COLUMNS.map(([k, v]) => (
                <div key={k} className="grid gap-1 sm:grid-cols-[10rem_1fr]"><dt className="font-mono text-[13px]">{k}</dt><dd className="text-ink-soft">{v}</dd></div>
              ))}
            </dl>
          </details>
          <div className="mt-6 rounded-2xl border border-line bg-paper p-5 sm:p-6">
            <ImportForm askName onReport={setReport} onDone={done} />
          </div>
        </>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          <section className="rounded-2xl border border-peacock bg-peacock-wash p-5 sm:p-6" aria-labelledby="done-title">
            <h2 id="done-title" className="text-[22px] font-medium tracking-[-0.02em]">✓ {result.catalog.name} is live with {result.catalog.itemCount} items</h2>
            <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed">Save both links now. We store only a fingerprint of them, so we cannot show them again or recover them. Your manage link also opens a usage view with anonymous counts once shoppers use your catalog.</p>
            <dl className="mt-5 space-y-4 text-[14px]">
              <div><dt className="text-ink-soft">Manage link (private, keep it to yourself)</dt><dd className="mt-1 break-all font-mono">{origin}/c/{result.tokens.manage}</dd></div>
              <div><dt className="text-ink-soft">Shopper link (share this with customers)</dt><dd className="mt-1 break-all font-mono">{origin}/c/{result.tokens.share}</dd></div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button to={`/c/${result.tokens.manage}`}>Open my catalog</Button>
              <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(`${origin}/c/${result.tokens.share}`)}>Copy shopper link</Button>
            </div>
          </section>
        </div>
      )}

      {report && <div className="mt-6"><ImportReport report={report} /></div>}

      <p className="mt-10 text-[14px] text-ink-soft">
        Want to see what shoppers see first? <Link to="/catalog" className="text-rani underline underline-offset-4">Browse the sample catalog</Link>, which also shows the usage numbers a retailer sees. Catalogs are removed 30 days after the last change.
      </p>
    </section>
  );
}
