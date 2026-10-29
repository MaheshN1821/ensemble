export const SESSION_KEY = 'ensemble.session';

/** The saved anonymous session, if it is still valid. Never creates one. Safe when storage is blocked. */
export function readStoredSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (s?.sessionId && new Date(s.expiresAt) > new Date()) return s;
  } catch {
    /* storage can be blocked or empty */
  }
  return null;
}

/** Remembers a session the server gave us (anonymous, or a signed-in shopper's saved one). */
export function writeStoredSession(s) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId: s.sessionId, expiresAt: s.expiresAt, caps: s.caps })); } catch { /* storage can be blocked */ }
}

export function clearStoredSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
