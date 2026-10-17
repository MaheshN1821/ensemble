import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const KEY = 'ensemble.session';

function readStored() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY));
    if (s?.sessionId && new Date(s.expiresAt) > new Date()) return s;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Anonymous session: a random id kept in sessionStorage only (cleared when the tab closes).
 * Nothing about the person is stored.
 */
export function useSession() {
  const [session, setSession] = useState(readStored);
  const [error, setError] = useState(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const s = await api('/api/sessions', { method: 'POST' });
      sessionStorage.setItem(KEY, JSON.stringify(s));
      setSession(s);
    } catch (e) {
      setError(e);
    }
  }, []);

  /** Forget the current session (expired or deleted). The effect below then starts a fresh one. */
  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setSession(null);
  }, []);

  useEffect(() => {
    if (!session) start();
  }, [session, start]);

  return { session, error, retry: start, reset };
}
