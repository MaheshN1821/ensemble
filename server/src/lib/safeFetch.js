import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

/** True for addresses a retailer-supplied URL must never reach: loopback, private, link-local, metadata, multicast. */
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0)
    );
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    if (s === '::1' || s === '::') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith('ff');
  }
  return true; // not an IP at all: refuse
}

export class FetchRefused extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/**
 * Downloads an image for the importer. Server-side requests to a URL a stranger typed are a classic SSRF hole, so:
 * https only, the hostname is resolved first and every address must be public, the connection is pinned to that
 * address (no second lookup an attacker could change), redirects are followed by hand and re-checked, and the body
 * is capped in size and time. `allowHttp` and `allowPrivate` exist for tests only.
 */
export function createSafeFetcher({ maxBytes, timeoutMs, maxRedirects = 3, allowHttp = false, allowPrivate = false, lookup = (h) => dns.lookup(h, { all: true }) }) {
  async function once(url) {
    const u = new URL(url);
    if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) throw new FetchRefused('BAD_URL', 'Image links must start with https://.');
    if (u.username || u.password) throw new FetchRefused('BAD_URL', 'Image links cannot contain a username or password.');
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const addrs = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host).catch(() => { throw new FetchRefused('DNS_FAILED', `Could not find the host ${host}.`); });
    if (!addrs.length) throw new FetchRefused('DNS_FAILED', `Could not find the host ${host}.`);
    if (!allowPrivate && addrs.some((a) => isPrivateAddress(a.address))) throw new FetchRefused('BLOCKED_ADDRESS', 'That image link points to a private or internal address.');
    const pinned = addrs[0];
    const mod = u.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = mod.get(u, {
        lookup: (_h, options, cb) => {
          if (options.all) return cb(null, [pinned]);
          return cb(null, pinned.address, pinned.family);
        },
        headers: { 'User-Agent': 'EnsembleCatalogImport/1.0', Accept: 'image/jpeg,image/png' },
        timeout: timeoutMs,
      }, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) { res.resume(); return resolve({ redirect: new URL(res.headers.location, u).toString() }); }
        if (status !== 200) { res.resume(); return reject(new FetchRefused('HTTP_ERROR', `The image link answered with status ${status}.`)); }
        const declared = Number(res.headers['content-length']);
        if (declared > maxBytes) { res.destroy(); return reject(new FetchRefused('TOO_LARGE', `The image is larger than ${Math.round(maxBytes / 1048576)} MB.`)); }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > maxBytes) { res.destroy(); reject(new FetchRefused('TOO_LARGE', `The image is larger than ${Math.round(maxBytes / 1048576)} MB.`)); } else chunks.push(c);
        });
        res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] ?? '' }));
        res.on('error', () => reject(new FetchRefused('NETWORK', 'The image download was interrupted.')));
      });
      req.on('timeout', () => { req.destroy(); reject(new FetchRefused('TIMEOUT', 'The image took too long to download.')); });
      req.on('error', (e) => reject(e instanceof FetchRefused ? e : new FetchRefused('NETWORK', 'Could not download the image.')));
    });
  }

  return {
    async fetchImage(url) {
      let current = url;
      for (let hop = 0; hop <= maxRedirects; hop++) {
        const r = await once(current);
        if (r.redirect) { current = r.redirect; continue; }
        return r;
      }
      throw new FetchRefused('TOO_MANY_REDIRECTS', 'The image link redirects too many times.');
    },
  };
}
