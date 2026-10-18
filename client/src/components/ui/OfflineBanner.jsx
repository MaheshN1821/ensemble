import { useEffect, useState } from 'react';

/** Tells the person when the connection drops, because every action here needs the server. */
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  if (online) return null;
  return (
    <p role="status" className="bg-ink px-5 py-2.5 text-center text-[14px] text-white">
      <span aria-hidden="true" className="mr-2 font-mono">!</span>You are offline. Photos and looks will load again when you reconnect.
    </p>
  );
}
