import Button from '../components/Button.jsx';

export default function NotFound() {
  return (
    <section className="mx-auto max-w-2xl px-5 py-24 sm:px-8">
      <h1 className="text-[36px] font-light tracking-[-0.03em]">That page does not exist.</h1>
      <p className="mt-4 text-[17px] text-ink-soft">Check the address, or go back to the start.</p>
      <Button to="/" className="mt-8">Back to home</Button>
    </section>
  );
}
