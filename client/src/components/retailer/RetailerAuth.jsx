import AuthForm from '../auth/AuthForm.jsx';

const POINTS = [
  ['Upload once, stay live', 'Your items go into the shared Ensemble catalog the moment they pass checks. Shoppers see them with no link to send.'],
  ['Everything in one place', 'Sign in from any device to see every upload and every item, add more, or delete what you no longer sell.'],
  ['See what gets picked', 'Anonymous counts show which of your items appear in the looks shoppers choose.'],
];

/** What a retailer sees at /retailer before signing in: why, and the sign-in / create-account form. */
export default function RetailerAuth({ onDone }) {
  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_26rem] lg:gap-14">
      <ul className="space-y-6 self-start">
        {POINTS.map(([title, body]) => (
          <li key={title} className="border-t border-line pt-4">
            <h2 className="text-[18px] font-medium tracking-[-0.01em]">{title}</h2>
            <p className="mt-1.5 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">{body}</p>
          </li>
        ))}
      </ul>
      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <h2 className="mb-5 text-[20px] font-medium tracking-[-0.02em]">Retailer account</h2>
        <AuthForm role="retailer" onDone={onDone} />
      </div>
    </div>
  );
}
