/** Shown while the YouCam task runs. The arches rise and fall once per beat; still when reduced motion is on. */
export default function Analysing({ sample }) {
  return (
    <div role="status" className="py-8">
      <svg width="64" height="56" viewBox="0 0 36 32" aria-hidden="true" className="mb-8">
        <path className="arch-pulse" style={{ animationDelay: '0ms' }} fill="var(--color-rani)" d="M1 32V15a6 6 0 0 1 12 0v17z" />
        <path className="arch-pulse" style={{ animationDelay: '160ms' }} fill="var(--color-peacock)" d="M12 32V8a6 6 0 0 1 12 0v24z" />
        <path className="arch-pulse" style={{ animationDelay: '320ms' }} fill="var(--color-zari)" d="M23 32V13a6 6 0 0 1 12 0v19z" />
      </svg>
      <h1 className="text-[34px] font-light leading-[1.08] tracking-[-0.03em] sm:text-[44px]">Reading your skin tone</h1>
      <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">
        {sample
          ? 'Reading the sample model. Nothing is sent to YouCam.'
          : 'Your selfie is with the YouCam API now. This can take up to a minute. Keep this page open.'}
      </p>
    </div>
  );
}
