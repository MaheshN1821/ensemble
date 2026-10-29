export const STORE_KEY = 'ensemble.store';

/** The retailer store link the shopper opened in this tab, if any. Safe when storage is blocked. */
export function readStoreCode() {
  try { return sessionStorage.getItem(STORE_KEY) || null; } catch { return null; }
}
export function writeStoreCode(code) {
  try { if (code) sessionStorage.setItem(STORE_KEY, code); else sessionStorage.removeItem(STORE_KEY); } catch { /* storage can be blocked */ }
}
