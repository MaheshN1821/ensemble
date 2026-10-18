import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * Loads a catalog: the sample catalog when no token is given, otherwise the catalog behind a private link.
 * `role` is 'owner' for the manage link and 'viewer' for the shopper link; the server decides.
 */
export function useCatalog(token) {
  const [state, setState] = useState({ phase: 'loading', data: null, error: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, phase: 'loading', error: null }));
    try {
      const data = token ? await api('/api/catalogs/mine', { catalogToken: token }) : await api('/api/catalog/sample');
      setState({ phase: 'ready', data, error: null });
    } catch (error) {
      setState({ phase: 'error', data: null, error });
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  /** Replaces the loaded data with a server response that carries { catalog, items } (after an import or delete). */
  const apply = useCallback((next) => setState({ phase: 'ready', data: { catalog: next.catalog, items: next.items }, error: null }), []);

  return { ...state, reload: load, apply };
}
