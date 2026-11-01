/**
 * The catalog Ensemble starts with: data/seedCatalog.json (11 items: 10 outfits, a necklace, earrings and a lipstick),
 * each with its photo already hosted on Cloudinary. To change the starting catalog, edit that JSON file and redeploy:
 * the server fingerprints the file and re-applies it at boot when the fingerprint changes. Items a retailer uploaded are
 * never touched by this.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('./seedCatalog.json', import.meta.url), 'utf8');
const data = JSON.parse(text);

export const SEED_ROWS = Array.isArray(data) ? data : data.items;
export const SEED_VERSION = createHash('sha1').update(text).digest('hex').slice(0, 12);
