import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Logo from './Logo.jsx';
import Button from './Button.jsx';

function Header() {
  const link = ({ isActive }) =>
    `text-[15px] transition-colors hover:text-rani ${isActive ? 'text-ink' : 'text-ink-soft'}`;
  return (
    <header className="border-b border-line/80">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label="Ensemble home">
          <Logo size={26} />
          <span className="text-[22px] font-medium tracking-[-0.03em]">Ensemble</span>
        </Link>
        <nav className="flex items-center gap-6 sm:gap-8" aria-label="Main">
          <a href="/#how" className="hidden text-[15px] text-ink-soft transition-colors hover:text-rani sm:block">
            How it works
          </a>
          <NavLink to="/catalog" className={link}>Catalog</NavLink>
          <NavLink to="/retailer" className={`${link} hidden sm:block`}>For retailers</NavLink>
          <NavLink to="/system" className={link}>System</NavLink>
          <Button to="/start" className="h-10 px-5 text-sm">Start</Button>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-10 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>AI preview. Colour and fit may differ from the real product.</p>
        <p>Skin tone, try-on and makeup by the YouCam API.</p>
      </div>
    </footer>
  );
}

export default function Layout() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.querySelector(hash)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
