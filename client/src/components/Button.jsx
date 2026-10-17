import { Link } from 'react-router-dom';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full px-6 h-12 text-[15px] font-medium tracking-[-0.005em] transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const variants = {
  primary: 'bg-rani text-white hover:bg-rani-deep',
  secondary: 'bg-paper text-ink border border-line hover:border-ink',
  quiet: 'text-ink hover:text-rani px-3',
};

export default function Button({ to, href, variant = 'primary', className = '', children, ...props }) {
  const cls = `${base} ${variants[variant]} ${className}`;
  if (to) return <Link to={to} className={cls} {...props}>{children}</Link>;
  if (href) return <a href={href} className={cls} {...props}>{children}</a>;
  return <button type="button" className={cls} {...props}>{children}</button>;
}
