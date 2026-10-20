import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';

const REFRESH_MS = 20_000;

/**
 * Aggregate usage counts for one catalog (the retailer view). With a manage token it reads that catalog; without one it
 * reads the public sample catalog's counts. Refreshes quietly while the tab is visible, so counts rise as shoppers use it.
 */
export function useUsage(token) {
  const [state, setState] = useState({ phase: 'loading', data: null, error: null });
  const seq = useRef(0);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const mine = ++seq.current;
    if (!quiet) setState((s) => ({ ...s, phase: s.data ? 'refreshing' : 'loading', error: null }));
    try {
      const data = token ? await api('/api/catalogs/mine/stats', { catalogToken: token }) : await api('/api/catalog/sample/stats');
      if (mine === seq.current) setState({ phase: 'ready', data, error: null });
    } catch (error) {
      // A failed quiet refresh keeps the numbers on screen; only a first load or a manual refresh shows the error.
      if (mine === seq.current) setState((s) => (quiet && s.data ? s : { phase: 'error', data: s.data, error }));
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load({ quiet: true }); }, REFRESH_MS);
    return () => { clearInterval(t); seq.current++; };
  }, [load]);

  return { ...state, reload: () => load() };
}
