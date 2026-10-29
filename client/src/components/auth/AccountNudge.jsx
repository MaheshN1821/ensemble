import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';

/**
 * A quiet, optional note for people without an account: nothing is blocked, this only says what an account would keep.
 * Shows nothing once signed in (or before we know).
 */
export default function AccountNudge({ className = '', children }) {
  const { shopper, ready } = useAuth();
  if (!ready || shopper.token) return null;
  return (
    <aside className={`rounded-2xl border border-line bg-paper px-5 py-4 text-[15px] leading-relaxed ${className}`} aria-label="Save your progress">
      <p>
        <span className="font-medium">Want to keep this?</span>{' '}
        <span className="text-ink-soft">{children ?? 'Without an account everything is deleted within a day. A free account keeps your colours and looks so you can come back to them.'}</span>{' '}
        <Link to="/account" className="whitespace-nowrap text-rani underline underline-offset-4">Create an account</Link>
        <span className="text-ink-soft"> (optional)</span>
      </p>
    </aside>
  );
}
