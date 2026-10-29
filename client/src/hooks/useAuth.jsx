import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { clearToken, readToken, writeToken } from '../lib/auth.js';
import { clearStoredSession, readStoredSession, writeStoredSession } from '../lib/session.js';

const AuthContext = createContext(null);
const ROLES = ['shopper', 'retailer'];
const empty = () => ({ token: null, account: null });

/**
 * Who is signed in. Two independent sign-ins: a shopper account (optional) and a retailer account. `ready` turns true once
 * stored tokens have been checked with the server, so pages know whether to show a sign-in form or the person's own space.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState(() => ({ shopper: { ...empty(), token: readToken('shopper') }, retailer: { ...empty(), token: readToken('retailer') } }));
  const [ready, setReady] = useState(() => !ROLES.some((r) => readToken(r)));

  const set = useCallback((role, value) => setState((s) => ({ ...s, [role]: value })), []);

  // Check stored tokens once. A rejected token is dropped; a network failure keeps it (we may just be offline).
  useEffect(() => {
    let live = true;
    (async () => {
      await Promise.all(ROLES.map(async (role) => {
        const token = readToken(role);
        if (!token) return;
        try {
          const out = await api('/api/auth/me', { authToken: token });
          if (!live) return;
          set(role, { token, account: out.account });
          if (role === 'shopper' && out.session) writeStoredSession(out.session);
        } catch (e) {
          if (e.status === 401) { clearToken(role); if (live) set(role, empty()); }
        }
      }));
      if (live) setReady(true);
    })();
    return () => { live = false; };
  }, [set]);

  /** mode: 'login' or 'register'. A shopper's current anonymous session is offered to the server, so their work joins the account. */
  const signIn = useCallback(async (role, mode, body) => {
    const out = await api(`/api/auth/${role}/${mode}`, { method: 'POST', body, sessionId: role === 'shopper' ? readStoredSession()?.sessionId : undefined });
    writeToken(role, out.token);
    set(role, { token: out.token, account: out.account });
    if (role === 'shopper' && out.session) writeStoredSession(out.session);
    return out;
  }, [set]);

  /** Drops the sign-in on this browser. Everything stays saved on the server for the next sign-in. */
  const signOut = useCallback(async (role) => {
    const token = readToken(role);
    if (token) await api('/api/auth/logout', { method: 'POST', authToken: token }).catch(() => {});
    clearToken(role);
    set(role, empty());
    if (role === 'shopper') clearStoredSession(); // the next visit starts a fresh anonymous session
  }, [set]);

  /** After the server deleted the account: forget it locally. */
  const forget = useCallback((role) => {
    clearToken(role);
    set(role, empty());
    if (role === 'shopper') clearStoredSession();
  }, [set]);

  const value = useMemo(() => ({ ...state, ready, signIn, signOut, forget }), [state, ready, signIn, signOut, forget]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
