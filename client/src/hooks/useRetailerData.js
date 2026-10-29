import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * The signed-in retailer's whole space from the server: every item and every upload, so nothing is lost on refresh.
 * Mutating calls return the same shape, so `apply(next)` swaps in the fresh state.
 */
export function useRetailerDashboard(token, { onSignedOut } = {}) {
  const [state, setState] = useState({ phase: 'loading', data: null, error: null });
  const gone = useRef(onSignedOut);
  gone.current = onSignedOut;

  const load = useCallback(async () => {
    setState((s) => ({ ...s, phase: s.data ? 'refreshing' : 'loading', error: null }));
    try {
      setState({ phase: 'ready', data: await api('/api/retailer/dashboard', { authToken: token }), error: null });
    } catch (error) {
      if (error.status === 401) gone.current?.();
      setState((s) => ({ phase: 'error', data: s.data, error }));
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  const apply = useCallback((next) => setState({ phase: 'ready', data: { account: next.account, summary: next.summary, items: next.items, uploads: next.uploads }, error: null }), []);
  return { ...state, reload: load, apply };
}

const REFRESH_MS = 20_000;

/** How often shoppers' looks used this retailer's items. Refreshes quietly while the tab is visible. */
export function useRetailerStats(token, refreshKey) {
  const [state, setState] = useState({ phase: 'loading', data: null, error: null });
  const seq = useRef(0);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const mine = ++seq.current;
    if (!quiet) setState((s) => ({ ...s, phase: s.data ? 'refreshing' : 'loading', error: null }));
    try {
      const data = await api('/api/retailer/stats', { authToken: token });
      if (mine === seq.current) setState({ phase: 'ready', data, error: null });
    } catch (error) {
      if (mine === seq.current) setState((s) => (quiet && s.data ? s : { phase: 'error', data: s.data, error }));
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load({ quiet: true }); }, REFRESH_MS);
    return () => { clearInterval(t); seq.current++; };
  }, [load, refreshKey]);

  return { ...state, reload: () => load() };
}
