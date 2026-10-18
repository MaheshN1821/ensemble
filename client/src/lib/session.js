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
