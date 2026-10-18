import { createHmac, timingSafeEqual } from 'node:crypto';

const b64 = (buf) => Buffer.from(buf).toString('base64url');

/**
 * Expiring share links (FR-21), enforced by our own server because Cloudinary has no expiring-link feature we rely on.
 * A token carries the session id, the look id and an expiry, signed with HMAC-SHA256. Nothing is stored for it.
 * Deleting the session (or the look) makes every link for it stop working, because the server looks both up on each use.
 */
export function createShareTokens({ secret, now = Date.now }) {
  const sig = (body) => createHmac('sha256', secret).update(body).digest();

  return {
    sign({ sessionId, lookId, expiresAt }) {
      const body = b64(JSON.stringify({ s: sessionId, l: lookId, e: expiresAt }));
      return `${body}.${b64(sig(body))}`;
    },
    /** Returns { sessionId, lookId, expiresAt } or null for a forged, malformed or expired token. */
    verify(token) {
      if (typeof token !== 'string' || token.length > 400) return null;
      const [body, mac, extra] = token.split('.');
      if (!body || !mac || extra !== undefined) return null;
      const want = sig(body);
      let got;
      try { got = Buffer.from(mac, 'base64url'); } catch { return null; }
      if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
      let p;
      try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
      if (typeof p?.s !== 'string' || typeof p?.l !== 'string' || !Number.isFinite(p?.e)) return null;
      if (p.e <= now()) return null;
      return { sessionId: p.s, lookId: p.l, expiresAt: p.e };
    },
  };
}
