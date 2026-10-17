import Button from '../components/Button.jsx';

/** Placeholder until Stage 3 (skin tone profile). Keeps the intake flow from ending in a dead end. */
export default function Profile() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-20 sm:px-8 sm:py-28">
      <h1 className="text-[36px] font-light leading-[1.08] tracking-[-0.03em] sm:text-[48px]">Your details are saved.</h1>
      <p className="mt-6 max-w-[48ch] text-[17px] leading-relaxed text-ink-soft">
        The skin tone profile is the next thing we build. Your photos and answers stay in this session until they expire or you delete them.
      </p>
      <div className="mt-9 flex flex-wrap gap-3">
        <Button to="/start" variant="secondary">Change my details</Button>
        <Button to="/">Back to home</Button>
      </div>
    </section>
  );
}
