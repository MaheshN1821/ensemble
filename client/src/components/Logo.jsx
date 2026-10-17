/** Three arches of different heights: outfit, jewellery, lipstick. The mark and the hero motif are the same shape. */
export default function Logo({ size = 28, className = '' }) {
  return (
    <svg
      width={size * 1.125}
      height={size}
      viewBox="0 0 36 32"
      role="img"
      aria-label="Ensemble"
      className={className}
    >
      <path fill="var(--color-rani)" d="M1 32V15a6 6 0 0 1 12 0v17z" />
      <path fill="var(--color-peacock)" d="M12 32V8a6 6 0 0 1 12 0v24z" />
      <path fill="var(--color-zari)" d="M23 32V13a6 6 0 0 1 12 0v19z" />
    </svg>
  );
}
