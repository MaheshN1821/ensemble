import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, matchPath, useLocation } from 'react-router-dom';
import Logo from './Logo.jsx';
import Button from './Button.jsx';
import ErrorBoundary from './ui/ErrorBoundary.jsx';
import OfflineBanner from './ui/OfflineBanner.jsx';
import TraceDrawer from './agent/TraceDrawer.jsx';
import { readStoredSession } from '../lib/session.js';

// One place for page titles: the browser tab, history and screen readers all announce them.
const TITLES = [
  ['/', 'Ensemble: see the whole look on you'],
  ['/start', 'Your photos and details'],
  ['/profile', 'Your colours'],
  ['/looks', 'Your looks'],
  ['/looks/:lookId', 'Your look'],
  ['/my-looks', 'My looks'],
  ['/compare', 'Compare two looks'],
  ['/s/:token', 'A shared look'],
  ['/catalog', 'Catalog'],
  ['/c/:token', 'Catalog'],
  ['/retailer', 'For retailers'],
  ['/system', 'System'],
];
const titleFor = (pathname) => TITLES.find(([pattern]) => matchPath({ path: pattern, end: true }, pathname))?.[1] ?? 'Page not found';

const NAV = [
  { to: '/my-looks', label: 'My looks' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/retailer', label: 'For retailers' },
];

function Header({ hasSession, onHood }) {
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const button = useRef(null);
  useEffect(() => { setMenu(false); }, [pathname]);
  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setMenu(false); button.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const link = ({ isActive }) => `inline-flex min-h-11 items-center text-[15px] transition-colors hover:text-rani ${isActive ? 'text-ink underline decoration-rani decoration-2 underline-offset-[10px]' : 'text-ink-soft'}`;
  const hoodClass = 'inline-flex min-h-11 items-center gap-2 text-[15px] text-ink-soft transition-colors hover:text-rani';
  return (
    <header className="border-b border-line/80">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link to="/" className="flex min-h-11 items-center gap-3" aria-label="Ensemble home">
          <Logo size={26} />
          <span className="text-[22px] font-medium tracking-[-0.03em]">Ensemble</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} className={link}>{n.label}</NavLink>)}
          {hasSession && <button type="button" onClick={onHood} className={hoodClass}><span aria-hidden="true" className="font-mono text-[13px]">{'{ }'}</span>Under the hood</button>}
          <Button to="/start" className="h-10 px-5 text-sm">Start</Button>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <Button to="/start" className="h-10 px-4 text-sm">Start</Button>
          <button ref={button} type="button" aria-expanded={menu} aria-controls="mobile-menu" onClick={() => setMenu((v) => !v)} className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-paper">
            <span className="sr-only">{menu ? 'Close menu' : 'Open menu'}</span>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">{menu ? <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}</svg>
          </button>
        </div>
      </div>

      {menu && (
        <nav id="mobile-menu" aria-label="Main" className="border-t border-line bg-paper px-5 pb-4 pt-2 md:hidden">
          <ul className="divide-y divide-line">
            <li><NavLink to="/#how" className="flex min-h-12 items-center text-[17px]">How it works</NavLink></li>
            {NAV.map((n) => <li key={n.to}><NavLink to={n.to} className="flex min-h-12 items-center text-[17px]">{n.label}</NavLink></li>)}
            {hasSession && <li><button type="button" onClick={() => { setMenu(false); onHood(); }} className="flex min-h-12 w-full items-center text-left text-[17px]">Under the hood</button></li>}
            <li><NavLink to="/system" className="flex min-h-12 items-center text-[17px]">System</NavLink></li>
          </ul>
        </nav>
      )}
    </header>
  );
}

function Footer({ hasSession, onHood }) {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-sm text-ink-soft sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p>AI preview. Colour and fit may differ from the real product.</p>
          <p>Skin tone, try-on and makeup by the YouCam API. Previews are not a rating of you.</p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-1">
          <li><Link to="/start" className="inline-flex min-h-11 items-center hover:text-rani">Delete my photos and data</Link></li>
          {hasSession && <li><button type="button" onClick={onHood} className="inline-flex min-h-11 items-center hover:text-rani">Under the hood</button></li>}
          <li><Link to="/retailer" className="inline-flex min-h-11 items-center hover:text-rani">For retailers</Link></li>
        </ul>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname, hash } = useLocation();
  const [announce, setAnnounce] = useState('');
  const [hood, setHood] = useState(false);
  const first = useRef(true);
  // The header shows "Under the hood" only once a session exists, and re-checks on every page change.
  const hasSession = Boolean(readStoredSession());
  const title = titleFor(pathname);

  useEffect(() => {
    document.title = title === TITLES[0][1] ? title : `${title} | Ensemble`;
    if (hash) document.querySelector(hash)?.scrollIntoView();
    else window.scrollTo(0, 0);
    if (first.current) { first.current = false; return; }
    setAnnounce(title);
    // If a page did not move focus itself, send it to the page heading so keyboard and screen-reader users start at the top.
    const t = setTimeout(() => {
      const a = document.activeElement;
      if (!a || a === document.body || a.closest('header')) document.querySelector('main h1')?.focus?.({ preventScroll: true });
    }, 250);
    return () => clearTimeout(t);
  }, [pathname, hash, title]);

  const sessionId = readStoredSession()?.sessionId;
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
      <OfflineBanner />
      <Header hasSession={hasSession} onHood={() => setHood(true)} />
      <main id="main" tabIndex={-1} className="outline-none">
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer hasSession={hasSession} onHood={() => setHood(true)} />
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      {hasSession && sessionId && <TraceDrawer sessionId={sessionId} open={hood} onClose={() => setHood(false)} />}
    </>
  );
}
