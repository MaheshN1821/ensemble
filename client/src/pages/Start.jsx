import Button from '../components/Button.jsx';

export default function Start() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-20 sm:px-8 sm:py-28">
      <h1 className="text-[36px] font-light leading-[1.08] tracking-[-0.03em] sm:text-[48px]">
        Photo intake opens in the next build.
      </h1>
      <p className="mt-6 max-w-[48ch] text-[17px] leading-relaxed text-ink-soft">
        The consent screen, camera capture and the occasion and budget form arrive in Stage 2. The server
        and try-on connection behind them are already running, and you can check them now.
      </p>
      <div className="mt-9 flex flex-wrap gap-3">
        <Button to="/system">Open the system check</Button>
        <Button to="/" variant="secondary">Back to home</Button>
      </div>
    </section>
  );
}
