import { createHash } from 'node:crypto';

/**
 * A short, one-way label for an id, for log lines. A session id is a credential (whoever holds it can act as that
 * session), so logs carry this fingerprint instead. The same session always gets the same label, which is enough to
 * follow one visit through the logs.
 */
export const shortId = (id) => (id ? createHash('sha256').update(String(id)).digest('hex').slice(0, 8) : undefined);

/** Share links carry a token in the path. Mask it so request logs never hold a working link. */
export function maskUrl(url = '') {
  return String(url)
    .replace(/(\/api\/share\/)[^/?#]+/, '$1:token')
    .replace(/(\/s\/)[^/?#]+/, '$1:token')
    .replace(/(\/c\/)[^/?#]+/, '$1:token')
    .slice(0, 300);
}
