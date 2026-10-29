import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

import { SESSION_KEY as KEY, readStoredSession as readStored } from '../lib/session.js';
import { clearToken, readToken } from '../lib/auth.js';
import { readStoreCode, writeStoreCode } from '../lib/store.js';

/**
 * The session every feature runs on. Without an account it is anonymous: a random id kept in sessionStorage only (cleared
 * when the tab closes) and deleted from the server within a day. A signed-in shopper gets their saved session back instead,
 * with their photos, skin reading and looks, even in a new tab or after the browser was closed.
 */
export function useSession() {
  const [session, setSession] = useState(readStored);
  const [error, setError] = useState(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const token = readToken('shopper');
      if (token) {
        try {
          const me = await api('/api/auth/me', { authToken: token });
          if (me.session) { sessionStorage.setItem(KEY, JSON.stringify(me.session)); setSession(me.session); return; }
        } catch (e) {
          if (e.status !== 401) throw e;
          clearToken('shopper'); // the sign-in lapsed: carry on anonymously
        }
      }
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

  // A store link opened in this tab limits the session's suggestions to that retailer. Failing to apply it is not an error:
  // the shopper simply gets suggestions from every retailer.
  const sessionId = session?.sessionId;
  useEffect(() => {
    const code = readStoreCode();
    if (!sessionId || !code) return;
    api('/api/sessions/me/store', { method: 'PUT', sessionId, body: { code } }).catch((e) => { if (e.status === 404) writeStoreCode(null); });
  }, [sessionId]);

  return { session, error, retry: start, reset };
}
