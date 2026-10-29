import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { writeStoreCode } from '../lib/store.js';

/**
 * Says which retailer the suggestions come from, when the shopper opened a store link, and lets them go back to every retailer.
 * Reads the session's own setting from the server, so it also shows for a signed-in shopper in a new tab. Nothing when not scoped.
 */
export default function StoreBanner({ sessionId, className = '', onChange }) {
  const [store, setStore] = useState(null);
  useEffect(() => {
    if (!sessionId) return undefined;
    let live = true;
    (async () => {
      try {
        const me = await api('/api/sessions/me', { sessionId });
        if (!me.storeCode) { if (live) setStore(null); return; }
        const s = await api(`/api/catalog/store/${encodeURIComponent(me.storeCode)}`);
        if (live) setStore(s.store);
      } catch { if (live) setStore(null); }
    })();
    return () => { live = false; };
  }, [sessionId]);

  const clear = useCallback(async () => {
    try { await api('/api/sessions/me/store', { method: 'PUT', sessionId, body: { code: null } }); writeStoreCode(null); setStore(null); onChange?.(); } catch { /* leave the banner; they can try again */ }
  }, [sessionId, onChange]);

  if (!store) return null;
  return (
    <aside className={`rounded-2xl border border-rani bg-rani-wash px-5 py-4 text-[15px] leading-relaxed ${className}`} aria-label="Store scope">
      <p>
        Suggestions come only from <span className="font-medium">{store.name}</span> ({store.itemCount} items).{' '}
        <button type="button" onClick={clear} className="whitespace-nowrap text-rani-deep underline underline-offset-4">Use every retailer instead</button>
      </p>
    </aside>
  );
}
