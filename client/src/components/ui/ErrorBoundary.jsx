import { Component } from 'react';
import { Link } from 'react-router-dom';

/** Catches a crash while drawing a page, so the person sees a plain message and a way out instead of a blank screen. */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error) {
    // Nothing personal is logged: the message and the page only.
    console.error('page crashed:', error?.message, window.location.pathname); // eslint-disable-line no-console
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="mx-auto max-w-2xl px-5 py-20 sm:px-8">
        <h1 tabIndex={-1} ref={(el) => el?.focus()} className="text-[34px] font-light leading-[1.08] tracking-[-0.03em] outline-none sm:text-[44px]">Something went wrong on this page</h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">Your photos and looks are safe. Reload the page to try again, or go back to the start.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={() => window.location.reload()} className="inline-flex h-12 items-center rounded-full bg-rani px-6 text-[15px] font-medium text-white hover:bg-rani-deep">Reload this page</button>
          <Link to="/" className="inline-flex h-12 items-center rounded-full border border-line bg-paper px-6 text-[15px] font-medium hover:border-ink">Back to home</Link>
        </div>
      </section>
    );
  }
}
