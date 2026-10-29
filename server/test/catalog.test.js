import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseCsv } from '../src/lib/csv.js';
import { decodePng } from '../src/lib/png.js';
import { encodePng } from '../src/lib/pngEncode.js';
import { createSafeFetcher, isPrivateAddress } from '../src/lib/safeFetch.js';
import { coloursFromPixels, explicitColours, familyOf, finaliseColours } from '../src/services/catalog/colours.js';
import { validateRow } from '../src/services/catalog/validate.js';
import { checkImage } from '../src/services/catalog/imageChecks.js';
import { createImporter, parseRows } from '../src/services/catalog/importer.js';
import { createCatalogService } from '../src/services/catalog/service.js';
import { createMemoryCatalogRepo } from '../src/services/catalog/repoMemory.js';
import { SEED_ROWS } from '../src/data/seed.js';
import { LIMITS, MAIN_CATALOG_ID, occasionIds } from '../src/config/catalog.js';
import { createMemoryStorage } from './fakes.js';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

// ---- helpers: draw a flat garment on white as a real PNG ----
function garmentPng(w, h, { body = [110, 26, 45], trim = [230, 207, 160], background = [255, 255, 255] } = {}) {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = (y * w + x) * 4;
    const inside = x > w * 0.25 && x < w * 0.75 && y > h * 0.1 && y < h * 0.9;
    const c = inside ? (y < h / 2 ? body : trim) : background;
    data[k] = c[0]; data[k + 1] = c[1]; data[k + 2] = c[2]; data[k + 3] = 255;
  }
  return encodePng({ width: w, height: h, data });
}
const noisyPng = (w, h) => {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = (i * 37) % 256; data[i * 4 + 1] = (i * 91) % 256; data[i * 4 + 2] = (i * 53) % 256; data[i * 4 + 3] = 255; }
  return encodePng({ width: w, height: h, data });
};

// ---- CSV ----
test('csv: quotes, doubled quotes, embedded newlines, CRLF, BOM, blank lines, line numbers', () => {
  const { headers, rows } = parseCsv('\uFEFFId, Name\r\na,"Zari, ""gold"""\r\n\r\nb,"two\nlines"\nc,x');
  assert.deepEqual(headers, ['id', 'name']);
  assert.equal(rows[0].name, 'Zari, "gold"');
  assert.equal(rows[0].__line, 2);
  assert.equal(rows[1].name, 'two\nlines');
  assert.equal(rows[1].__line, 4);
  assert.equal(rows[2].__line, 6);
  assert.throws(() => parseCsv('a,b\n"open,1'), { code: 'CSV_UNTERMINATED_QUOTE' });
});

// ---- PNG round trip ----
test('png: encoder and decoder round-trip real pixels', () => {
  const d = decodePng(garmentPng(40, 60));
  assert.equal(d.width, 40); assert.equal(d.height, 60);
  assert.deepEqual([...d.data.subarray(0, 4)], [255, 255, 255, 255]);
  const k = (30 * 40 + 20) * 4; // centre of the lower half
  assert.deepEqual([...d.data.subarray(k, k + 3)], [230, 207, 160]);
  assert.equal(decodePng(Buffer.from('not a png at all, just some text here')), null);
});

// ---- colours ----
test('colours: families, background removal, merging, explicit colours', () => {
  assert.equal(familyOf('#C21F2F'), 'red');
  assert.equal(familyOf('#1A1A1F'), 'black');
  assert.equal(familyOf('#8F8F8F'), 'grey');
  const px = coloursFromPixels(decodePng(garmentPng(80, 120)));
  assert.equal(px.plainBackground, true);
  assert.deepEqual(px.colours.map((c) => c.family).sort(), ['champagne', 'maroon']);
  assert.ok(!px.colours.some((c) => c.family === 'ivory'), 'white background is not a colour of the garment');
  assert.ok(Math.abs(px.colours.reduce((s, c) => s + c.share, 0) - 1) < 0.02);

  // A white garment on a white background still reads as white, not as "no colours".
  const white = coloursFromPixels(decodePng(garmentPng(80, 120, { body: [243, 235, 217], trim: [243, 235, 217] })));
  assert.deepEqual(white.colours.map((c) => c.family), ['ivory']);
  const allWhite = coloursFromPixels(decodePng(garmentPng(80, 120, { body: [255, 255, 255], trim: [255, 255, 255] })));
  assert.equal(allWhite.colours.length, 1);

  // Noise colours are dropped and similar colours merge into one family.
  const out = finaliseColours([{ hex: '#6E1A2D', weight: 50 }, { hex: '#701B2F', weight: 45 }, { hex: '#2748B5', weight: 2 }]);
  assert.equal(out.length, 1); assert.equal(out[0].family, 'maroon');
  assert.deepEqual(finaliseColours([]), []);

  const ex = explicitColours(['Maroon', 'gold', '#2748B5']);
  assert.equal(ex.colours[0].family, 'maroon');
  assert.equal(ex.colours.length, 3);
  assert.deepEqual(explicitColours(['maroon', 'sparkle']).error, ['sparkle']);
});

// ---- validation ----
const goodOutfit = { __line: 2, id: 'S-1', type: 'outfit', name: 'Maroon saree', price: '₹14,500', image_url: 'https://shop.test/a.png', formality: '5', occasion_tags: 'wedding-guest|Festive', colours: 'maroon|gold' };

test('validate: accepts common spellings and normalises', () => {
  const { item, errors } = validateRow({ SKU: 'S 1', Title: 'Maroon saree', 'Product Type': 'Saree', MRP: 'Rs. 14,500', Image: goodOutfit.image_url, Formality: 5, Occasions: 'wedding-guest;festive' });
  assert.deepEqual(errors, []);
  assert.equal(item.itemId, 's-1'); assert.equal(item.type, 'outfit'); assert.equal(item.price, 14500);
  assert.equal(item.garmentCategory, 'full_body'); assert.deepEqual(item.occasions, ['wedding-guest', 'festive']);
  assert.equal(item.colourSource, 'pending');
});

test('validate: every problem is reported with a field and a fix', () => {
  const { item, errors } = validateRow({ type: 'hat', name: '', price: '12.5', image_url: 'http://insecure.test/a.jpg', formality: '9', occasion_tags: 'wedding|moonwalk' });
  assert.equal(item, null);
  assert.deepEqual(errors.map((e) => e.field).sort(), ['formality', 'image_url', 'name', 'occasion_tags', 'price', 'type']);
  for (const e of errors) assert.ok(e.message.length > 15);
  // jewellery needs a metal; lipstick does not need formality
  assert.ok(validateRow({ ...goodOutfit, type: 'necklace' }).errors.some((e) => e.field === 'metal_tone'));
  assert.equal(validateRow({ type: 'lipstick', name: 'Red', price: 500, image_url: 'https://a.test/x.png', colours: '#B82A38' }).errors.length, 0);
  assert.ok(validateRow({ ...goodOutfit, price: 5 }).errors.some((e) => e.field === 'price'));
  assert.ok(occasionIds.length === 8);
});

// ---- image checks ----
test('image checks: size, shape, background and format', () => {
  const ok = checkImage(garmentPng(500, 700), 'outfit');
  assert.deepEqual(ok.errors, []); assert.deepEqual(ok.warnings, []); assert.ok(ok.pixels.colours.length);
  assert.equal(checkImage(garmentPng(100, 150), 'outfit').errors.length, 1);
  assert.match(checkImage(Buffer.from('<html>login page</html> padding padding padding'), 'outfit').errors[0].message, /JPG or PNG/);
  assert.ok(checkImage(garmentPng(700, 500), 'outfit').warnings.some((w) => /wider than/.test(w.message)));
  assert.ok(checkImage(noisyPng(500, 700), 'outfit').warnings.some((w) => /background/.test(w.message)));
});

// ---- SSRF guard ----
test('safe fetch: blocks private addresses, non-https, and downloads from allowed hosts', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);

  const strict = createSafeFetcher({ maxBytes: 1000, timeoutMs: 1000 });
  await assert.rejects(strict.fetchImage('http://example.com/a.png'), { code: 'BAD_URL' });
  await assert.rejects(strict.fetchImage('https://127.0.0.1/a.png'), { code: 'BLOCKED_ADDRESS' });
  await assert.rejects(strict.fetchImage('https://user:pw@example.com/a.png'), { code: 'BAD_URL' });
  const rebinding = createSafeFetcher({ maxBytes: 1000, timeoutMs: 1000, lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.5', family: 4 }] });
  await assert.rejects(rebinding.fetchImage('https://evil.test/a.png'), { code: 'BLOCKED_ADDRESS' });

  const png = garmentPng(30, 30);
  const server = http.createServer((req, res) => {
    if (req.url === '/redir') { res.writeHead(302, { Location: '/img.png' }); return res.end(); }
    if (req.url === '/loop') { res.writeHead(302, { Location: '/loop' }); return res.end(); }
    if (req.url === '/big') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(Buffer.alloc(5000)); }
    if (req.url === '/missing') { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const f = createSafeFetcher({ maxBytes: 100_000, timeoutMs: 2000, allowHttp: true, allowPrivate: true });
    assert.deepEqual((await f.fetchImage(`${base}/img.png`)).buffer, png);
    assert.deepEqual((await f.fetchImage(`${base}/redir`)).buffer, png);
    await assert.rejects(f.fetchImage(`${base}/loop`), { code: 'TOO_MANY_REDIRECTS' });
    await assert.rejects(f.fetchImage(`${base}/missing`), { code: 'HTTP_ERROR' });
    await assert.rejects(createSafeFetcher({ maxBytes: 1000, timeoutMs: 2000, allowHttp: true, allowPrivate: true }).fetchImage(`${base}/big`), { code: 'TOO_LARGE' });
  } finally { server.closeAllConnections?.(); server.close(); }
});

// ---- file parsing ----
test('parseRows: CSV and JSON, and plain file-level errors', () => {
  const csv = 'id,type,name,price,image_url\na,outfit,One,1000,https://a.test/1.png\nb,lipstick,Two,500,https://a.test/2.png';
  assert.equal(parseRows({ content: csv }).rows.length, 2);
  assert.equal(parseRows({ content: JSON.stringify({ items: [{ name: 'x' }] }) }).format, 'json');
  assert.equal(parseRows({ content: JSON.stringify([{ name: 'x' }]), format: 'json' }).rows.length, 1);
  const code = (fn) => { try { fn(); } catch (e) { return `${e.code}:${e.message}`; } };
  assert.match(code(() => parseRows({ content: '  ' })), /INVALID_FILE:.*empty/);
  assert.match(code(() => parseRows({ content: 'name,type\nx,outfit' })), /missing: price, image_url/);
  assert.match(code(() => parseRows({ content: '{"nope":1}', format: 'json' })), /list of items/);
  assert.match(code(() => parseRows({ content: '[1,', format: 'json' })), /could not be read/);
  const many = ['name,type,price,image_url', ...Array.from({ length: LIMITS.maxRowsPerImport + 1 }, (_, i) => `n${i},outfit,100,https://a.test/${i}.png`)].join('\n');
  assert.match(code(() => parseRows({ content: many })), /Import up to/);
});

// ---- importer + service with fakes ----
const fakeFetcher = (map) => ({
  async fetchImage(url) {
    const hit = map[url];
    if (!hit) { const e = new Error('The image link answered with status 404.'); e.code = 'HTTP_ERROR'; Object.setPrototypeOf(e, (await import('../src/lib/safeFetch.js')).FetchRefused.prototype); throw e; }
    return { buffer: hit, contentType: 'image/png' };
  },
});

function build({ storage = createMemoryStorage({ configured: true }), images = {}, seed } = {}) {
  const repo = createMemoryCatalogRepo();
  const calls = { metrics: [], sessions: [] };
  const metrics = { removeItems: async (c, ids) => { calls.metrics.push([c, ids]); }, deleteCatalog: async () => {} };
  const sessions = { dropExcludedItems: async (ids) => { calls.sessions.push(ids); } };
  const importer = createImporter({ fetcher: fakeFetcher(images), storage, logger: silentLogger });
  const catalogs = createCatalogService({ repo, importer, storage, metrics, sessions, config: { publicClientUrl: 'https://app.test/' }, logger: silentLogger, ...(seed ? { seed } : {}) });
  return { repo, catalogs, storage, calls };
}

const retailer = (id, code, businessName) => ({ _id: id, role: 'retailer', retailer: { code, businessName } });
const A = retailer('acc-a', 'ra1', 'Priya Silks');
const B = retailer('acc-b', 'rb2', 'Kavya Jewels');

const FILE = [
  'id,type,name,price,image_url,formality,occasion_tags,metal_tone,colours',
  'S1,outfit,Maroon saree,14500,https://shop.test/saree.png,5,wedding-guest|festive,,',
  'N1,necklace,Gold necklace,6200,https://shop.test/necklace.png,5,wedding-guest,gold,gold|maroon',
  'S1,outfit,Duplicate id,1000,https://shop.test/saree.png,3,,,',
  'X1,outfit,Missing image,3000,https://shop.test/nope.png,3,,,',
  'T1,outfit,Tiny,2000,https://shop.test/tiny.png,3,,,',
  'B1,outfit,Bad price,abc,https://shop.test/saree.png,3,,,',
].join('\n');
const IMAGES = { 'https://shop.test/saree.png': garmentPng(500, 700), 'https://shop.test/necklace.png': garmentPng(300, 300), 'https://shop.test/tiny.png': garmentPng(50, 50) };
const rowsOf = (n, from = 0, extra = '') => ['id,type,name,price,image_url,formality', ...Array.from({ length: n }, (_, i) => `K${from + i},outfit,Kurta ${from + i}${extra},1000,https://shop.test/saree.png,3`)].join('\n');

test('built-in catalog: the 13 items from the seed file, old sample removed, applied once', async () => {
  assert.equal(SEED_ROWS.length, 13);
  const { catalogs, repo } = build({ images: {} }); // photos unreachable: items still come in, flagged for a retry
  await repo.upsertCatalog({ _id: 'sample', name: 'Sample catalog', source: 'sample' });
  await repo.upsertItems('sample', [{ itemId: 'old', type: 'outfit', name: 'Old', price: 100 }]);

  const first = await catalogs.ensureMain();
  assert.equal(first.seeded, true);
  assert.equal(first.clean, false);
  assert.equal(await repo.getCatalog('sample'), null, 'the old sample catalog is gone');
  assert.equal(await repo.countItems('sample'), 0);

  const main = await catalogs.getMain();
  assert.equal(main.catalog.itemCount, 13);
  assert.deepEqual(main.catalog.counts, { outfit: 10, necklace: 1, earrings: 1, lipstick: 1 });
  assert.ok(main.items.every((i) => i.source === 'house' && i.seller === 'Ensemble'));
  assert.equal(main.items.find((i) => i.id === 'o-101').colourSource, 'merchant', 'explicit colours from the file are used');
  assert.equal(main.items.find((i) => i.id === 'j-310').colourSource, 'none', 'no colours given and the photo was unreachable');

  // Unreadable photos mean the next run tries again; once everything reads cleanly it settles.
  assert.equal((await catalogs.ensureMain()).seeded, true);
});

test('built-in catalog: settles once photos read, reads missing colours from them, never touches retailer items', async () => {
  const all = Object.fromEntries(SEED_ROWS.map((r) => [r.image_url, garmentPng(500, 700)]));
  const { catalogs, repo } = build({ images: { ...all, ...IMAGES } });
  await catalogs.ensureMain();
  assert.equal((await catalogs.ensureMain()).seeded, false);
  assert.equal((await catalogs.getMain()).items.find((i) => i.id === 'j-310').colourSource, 'image');
  await catalogs.importForRetailer(A, { content: FILE });
  const stored = (await repo.getCatalog(MAIN_CATALOG_ID)).version;
  assert.ok(stored && !stored.includes('!'));

  // Editing the seed file re-applies it: items dropped from the file go, retailer items stay.
  const smaller = build({ images: { ...all, ...IMAGES }, seed: { rows: SEED_ROWS.slice(0, 3), version: 'v2' } });
  smaller.repo.catalogs.set(MAIN_CATALOG_ID, { ...(await repo.getCatalog(MAIN_CATALOG_ID)) });
  for (const it of await repo.listItems(MAIN_CATALOG_ID)) smaller.repo.items.set(`${MAIN_CATALOG_ID}\u0000${it.itemId}`, it);
  await smaller.catalogs.ensureMain();
  const left = await smaller.catalogs.getMain();
  assert.equal(left.items.filter((i) => i.source === 'house').length, 3);
  assert.equal(left.items.filter((i) => i.source === 'retailer').length, 2);
});

test('retailer upload: items join the shared catalog under the retailer, bad rows say why', async () => {
  const { catalogs } = build({ images: IMAGES });
  const out = await catalogs.importForRetailer(A, { content: FILE, fileName: 'festive.csv' });
  assert.equal(out.report.totals.rows, 6);
  assert.equal(out.report.totals.imported, 2);
  assert.equal(out.report.totals.rejected, 4);
  const byLine = Object.fromEntries(out.report.rows.map((r) => [r.line, r]));
  assert.match(byLine[4].errors[0].message, /already used on line 2/);
  assert.match(byLine[5].errors[0].message, /status 404/);
  assert.match(byLine[6].errors[0].message, /50 by 50/);
  assert.equal(byLine[7].errors[0].field, 'price');
  assert.equal(byLine[2].id, 's1', 'reports show the id as the retailer wrote it');

  // Shoppers see it with no link or login.
  const shop = await catalogs.getMain();
  const saree = shop.items.find((i) => i.sku === 's1');
  assert.equal(saree.id, 'ra1-s1');
  assert.equal(saree.seller, 'Priya Silks');
  assert.equal(saree.source, 'retailer');
  assert.deepEqual(saree.colours.map((c) => c.family).sort(), ['champagne', 'maroon']);
  assert.ok(shop.catalog.sellers.includes('Priya Silks'));
  assert.equal((await catalogs.itemsForSession({})).items.length, 2);
  assert.equal((await catalogs.itemsForSession({ catalogId: 'whatever-old' })).catalog.id, MAIN_CATALOG_ID);
});

test('retailer dashboard keeps everything: every upload, every item, across uploads', async () => {
  const { catalogs } = build({ images: IMAGES });
  const first = await catalogs.importForRetailer(A, { content: rowsOf(3), fileName: 'first.csv' });
  const second = await catalogs.importForRetailer(A, { content: rowsOf(4, 10), fileName: 'second.csv' });
  const board = await catalogs.openDashboard(A);
  assert.equal(board.summary.items, 7);
  assert.equal(board.items.length, 7);
  assert.equal(board.uploads.length, 2);
  assert.deepEqual(board.uploads.map((u) => u.fileName).sort(), ['first.csv', 'second.csv']);
  assert.equal(board.uploads.find((u) => u.id === first.uploadId).itemsNow, 3);
  assert.equal(board.uploads.find((u) => u.id === second.uploadId).itemsNow, 4);
  // Same upload again updates by id and moves the items to the newest upload.
  const again = await catalogs.importForRetailer(A, { content: rowsOf(3), fileName: 'third.csv' });
  assert.equal(again.report.totals.updated, 3);
  assert.equal((await catalogs.openDashboard(A)).summary.items, 7);
});

test('two retailers can use the same id; each sees and changes only their own', async () => {
  const { catalogs } = build({ images: IMAGES });
  await catalogs.importForRetailer(A, { content: rowsOf(2) });
  await catalogs.importForRetailer(B, { content: rowsOf(2, 0, ' (B)') });
  assert.equal((await catalogs.getMain()).items.length, 4);
  assert.equal((await catalogs.openDashboard(A)).items.length, 2);
  assert.ok((await catalogs.openDashboard(B)).items.every((i) => i.seller === 'Kavya Jewels'));
  await assert.rejects(catalogs.removeItem(B, 'ra1-k0'), { code: 'NOT_FOUND' });
  await assert.rejects(catalogs.removeUpload(B, (await catalogs.openDashboard(A)).uploads[0].id), { code: 'NOT_FOUND' });
  await assert.rejects(catalogs.openDashboard({ _id: 'x', role: 'shopper' }), { code: 'FORBIDDEN' });
  assert.equal((await catalogs.getMain()).items.length, 4);
});

test('built-in items cannot be deleted by a retailer', async () => {
  const { catalogs } = build({ images: {} });
  await catalogs.ensureMain();
  await assert.rejects(catalogs.removeItem(A, 'o-101'), { code: 'NOT_FOUND' });
  assert.equal((await catalogs.getMain()).items.length, 13);
});

test('deleting an item removes it everywhere: catalog, planner, stored image, counters, exclusion lists', async () => {
  const { catalogs, storage, calls } = build({ images: IMAGES });
  await catalogs.importForRetailer(A, { content: FILE });
  assert.equal(storage.assets.size, 2);
  const board = await catalogs.removeItem(A, 'ra1-n1');
  assert.equal(board.items.length, 1);
  assert.ok(!storage.assets.has(`ensemble-catalog/${MAIN_CATALOG_ID}/ra1-n1`));
  assert.equal(storage.assets.size, 1);
  assert.deepEqual(calls.metrics, [[MAIN_CATALOG_ID, ['ra1-n1']]]);
  assert.deepEqual(calls.sessions, [['ra1-n1']]);
  assert.equal((await catalogs.itemsForSession({})).items.length, 1);
  await assert.rejects(catalogs.removeItem(A, 'ra1-n1'), { code: 'NOT_FOUND' });
});

test('a failed image delete leaves the item in place so it can be retried', async () => {
  const storage = createMemoryStorage({ configured: true });
  const { catalogs } = build({ images: IMAGES, storage });
  await catalogs.importForRetailer(A, { content: FILE });
  const real = storage.deleteCatalogImage;
  storage.deleteCatalogImage = async () => { throw new Error('storage down'); };
  await assert.rejects(catalogs.removeItem(A, 'ra1-s1'), { code: 'DELETE_FAILED' });
  assert.equal((await catalogs.openDashboard(A)).items.length, 2);
  storage.deleteCatalogImage = real;
  assert.equal((await catalogs.removeItem(A, 'ra1-s1')).items.length, 1);
});

test('deleting an upload removes its items, but not ones a later upload took over', async () => {
  const { catalogs } = build({ images: IMAGES });
  const one = await catalogs.importForRetailer(A, { content: rowsOf(3) });
  await catalogs.importForRetailer(A, { content: rowsOf(1) }); // updates K0, so K0 now belongs to the second upload
  const board = await catalogs.removeUpload(A, one.uploadId);
  assert.deepEqual(board.items.map((i) => i.sku), ['k0']);
  assert.equal(board.uploads.length, 1);
});

test('replace removes only this retailer\'s other items', async () => {
  const { catalogs, storage } = build({ images: IMAGES });
  await catalogs.importForRetailer(B, { content: rowsOf(2) });
  await catalogs.importForRetailer(A, { content: rowsOf(3) });
  const out = await catalogs.importForRetailer(A, { content: rowsOf(1, 0), mode: 'replace' });
  assert.equal(out.report.totals.removed, 2);
  assert.equal(out.items.length, 1);
  assert.equal((await catalogs.openDashboard(B)).items.length, 2);
  assert.equal(storage.assets.size, 3);
});

test('a rejected upload is kept in the history with its report; limits hold', async () => {
  const { catalogs } = build({ images: IMAGES });
  const bad = 'name,type,price,image_url\nA,outfit,abc,https://shop.test/saree.png';
  await assert.rejects(catalogs.importForRetailer(A, { content: bad, fileName: 'bad.csv' }), (e) => e.code === 'IMPORT_REJECTED' && e.details.report.totals.rejected === 1);
  const board = await catalogs.openDashboard(A);
  assert.equal(board.uploads[0].status, 'rejected');
  const rep = await catalogs.uploadReport(A, board.uploads[0].id);
  assert.equal(rep.report.rows[0].errors[0].field, 'price');
  await assert.rejects(catalogs.importForRetailer(A, { content: rowsOf(1), mode: 'merge' }), { code: 'INVALID_INPUT' });

  const per = LIMITS.maxItemsPerRetailer;
  const full = build({ images: IMAGES });
  for (let from = 0; from < per; from += 50) await full.catalogs.importForRetailer(A, { content: rowsOf(Math.min(50, per - from), from) });
  assert.equal((await full.catalogs.openDashboard(A)).summary.items, per);
  await assert.rejects(full.catalogs.importForRetailer(A, { content: rowsOf(1, per) }), { code: 'CATALOG_FULL' });
});

test('deleting a retailer account removes all of their items and uploads', async () => {
  const { catalogs, storage } = build({ images: IMAGES });
  await catalogs.importForRetailer(B, { content: rowsOf(1) });
  await catalogs.importForRetailer(A, { content: FILE });
  await catalogs.removeAllForRetailer(A);
  assert.equal((await catalogs.openDashboard(A)).items.length, 0);
  assert.equal((await catalogs.openDashboard(A)).uploads.length, 0);
  assert.equal((await catalogs.getMain()).items.length, 1);
  assert.equal(storage.assets.size, 1);
});

test('private catalogs left from before accounts are swept when expired', async () => {
  const { catalogs, repo } = build({ images: {} });
  await catalogs.ensureMain();
  await repo.upsertCatalog({ _id: 'legacy', name: 'Old', source: 'merchant', expiresAt: new Date(Date.now() - 1000) });
  await repo.upsertItems('legacy', [{ itemId: 'a', type: 'outfit', name: 'A', price: 100 }]);
  assert.deepEqual(await catalogs.sweepExpired(), { swept: 1 });
  assert.equal(await repo.countItems('legacy'), 0);
  assert.ok(await repo.getCatalog(MAIN_CATALOG_ID));
});

test('store link: a session scoped to one retailer plans only from their items; others mix every retailer', async () => {
  const { catalogs } = build({ images: IMAGES });
  await catalogs.ensureMain();
  await catalogs.importForRetailer(A, { content: FILE });
  await catalogs.importForRetailer(B, { content: rowsOf(2) });

  // Everyone else: one pool across retailers, so a look can mix sellers.
  const open = await catalogs.itemsForSession({});
  const sellers = new Set(open.items.map((i) => i.seller));
  assert.ok(sellers.has('Priya Silks') && sellers.has('Kavya Jewels') && sellers.has('Ensemble'));

  // A store's public page.
  const store = await catalogs.getStore('ra1');
  assert.equal(store.store.name, 'Priya Silks');
  assert.equal(store.store.itemCount, 2);
  assert.ok(store.items.every((i) => i.seller === 'Priya Silks'));
  await assert.rejects(() => catalogs.getStore('nope'), { code: 'STORE_NOT_FOUND' });

  // A scoped session sees only that store.
  const scoped = await catalogs.itemsForSession({ storeCode: 'ra1' });
  assert.equal(scoped.items.length, 2);
  assert.ok(scoped.items.every((i) => i.seller === 'Priya Silks'));
  assert.equal(scoped.fellBack, false);

  // A store with nothing left falls back to the whole catalog.
  const gone = await catalogs.itemsForSession({ storeCode: 'rzz9' });
  assert.equal(gone.fellBack, true);
  assert.ok(gone.items.length > 2);
});
