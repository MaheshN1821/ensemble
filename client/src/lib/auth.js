// Sign-in tokens live in localStorage, so a refresh, a closed tab or a restarted browser keeps people signed in until they
// sign out (or the token goes unused for 30 days). Retailer and shopper sign-ins are separate. Storage can be blocked: every
// call is guarded and the site works without it (people just sign in again).
const key = (role) => `ensemble.auth.${role}`;

export function readToken(role) {
  try { return localStorage.getItem(key(role)) || null; } catch { return null; }
}
export function writeToken(role, token) {
  try { localStorage.setItem(key(role), token); } catch { /* ignore */ }
}
export function clearToken(role) {
  try { localStorage.removeItem(key(role)); } catch { /* ignore */ }
}
