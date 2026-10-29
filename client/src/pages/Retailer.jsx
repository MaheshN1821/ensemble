import { useAuth } from '../hooks/useAuth.jsx';
import LoadingBlock from '../components/ui/LoadingBlock.jsx';
import RetailerAuth from '../components/retailer/RetailerAuth.jsx';
import RetailerDashboard from '../components/retailer/RetailerDashboard.jsx';

const H1 = 'text-[34px] font-light leading-[1.08] tracking-[-0.03em] sm:text-[44px]';

/** /retailer: sign in or register; once signed in, the retailer's dashboard. */
export default function Retailer() {
  const { retailer, ready } = useAuth();
  const signedIn = Boolean(retailer.token);
  return (
    <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className={H1}>{signedIn ? 'Your retailer dashboard' : 'For retailers'}</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-soft">
        {signedIn
          ? 'Everything you have uploaded lives here, saved to your account. Add items, delete the ones you no longer sell, and see how shoppers use them.'
          : 'Put your outfits, jewellery and lipsticks in front of shoppers who see complete looks on themselves. Create a free account, upload a spreadsheet, and your items are live.'}
      </p>
      {!ready ? <div className="mt-10"><LoadingBlock label="Checking your sign-in…" cards={2} /></div> : signedIn ? <RetailerDashboard /> : <RetailerAuth />}
    </section>
  );
}
