import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

/**
 * The looks kept in this session (up to six, FR-25). While any of them is still being drawn the list refreshes every
 * few seconds, so a status never goes stale. phase: loading | ready | error.
 */
export function useLooks(sessionId, { onSessionLost } = {}) {
  const [looks, setLooks] = useState([]);
  const [max, setMax] = useState(6);
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [removeError, setRemoveError] = useState(null);

  useEffect(() => {
    if (!sessionId) return undefined;
    const ac = new AbortController();
    let timer;
    const load = async () => {
      try {
        const out = await api('/api/sessions/me/looks', { sessionId, signal: ac.signal });
        if (ac.signal.aborted) return;
        setLooks(out.looks);
        setMax(out.max ?? 6);
        setPhase('ready');
        setError(null);
        if (out.looks.some((l) => l.active)) timer = setTimeout(load, 4000);
      } catch (e) {
        if (ac.signal.aborted) return;
        if (e.code === 'SESSION_EXPIRED') onSessionLost?.();
        setError(e);
        setPhase((p) => (p === 'ready' ? p : 'error'));
      }
    };
    load();
    return () => { ac.abort(); clearTimeout(timer); };
  }, [sessionId, nonce, onSessionLost]);

  const reload = useCallback(() => { setPhase('loading'); setError(null); setNonce((n) => n + 1); }, []);

  const remove = useCallback(async (lookId) => {
    setRemoveError(null);
    try {
      await api(`/api/sessions/me/looks/${lookId}`, { method: 'DELETE', sessionId });
      setLooks((prev) => prev.filter((l) => l.id !== lookId));
      return true;
    } catch (e) {
      setRemoveError(e);
      return false;
    }
  }, [sessionId]);

  return { looks, max, phase, error, reload, remove, removeError };
}
