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
import { SAMPLE_ITEMS, SAMPLE_CATALOG_ID } from '../src/data/sampleCatalog.js';
import { COLOUR_FAMILIES } from '../src/config/skin.js';
import { LIMITS, occasionIds } from '../src/config/catalog.js';
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

function build({ storage = createMemoryStorage({ configured: false }), images } = {}) {
  const repo = createMemoryCatalogRepo();
  const fetcher = fakeFetcher(images);
  const importer = createImporter({ fetcher, storage, logger: silentLogger });
  const catalogs = createCatalogService({ repo, importer, storage, config: { publicClientUrl: 'https://app.test/' }, logger: silentLogger });
  return { repo, catalogs, storage };
}

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

test('import: valid rows are usable at once, every bad row says why, colours come from the photo', async () => {
  const { catalogs } = build({ images: IMAGES });
  const out = await catalogs.createFromImport({ name: 'Priya Silks', content: FILE });
  assert.equal(out.report.totals.rows, 6);
  assert.equal(out.report.totals.imported, 2);
  assert.equal(out.report.totals.rejected, 4);
  const byLine = Object.fromEntries(out.report.rows.map((r) => [r.line, r]));
  assert.match(byLine[4].errors[0].message, /already used on line 2/);
  assert.match(byLine[5].errors[0].message, /status 404/);
  assert.match(byLine[6].errors[0].message, /50 by 50/);
  assert.equal(byLine[7].errors[0].field, 'price');

  assert.equal(out.items.length, 2);
  const saree = out.items.find((i) => i.id === 's1');
  assert.deepEqual(saree.colours.map((c) => c.family).sort(), ['champagne', 'maroon']);
  assert.equal(saree.colourSource, 'image');
  assert.equal(out.items.find((i) => i.id === 'n1').colourSource, 'merchant');
  assert.equal(saree.source, 'merchant');
  assert.match(out.tokens.share, /^ensc_/); assert.match(out.tokens.manage, /^ensm_/);
  assert.equal(out.catalog.role, 'owner');
  assert.deepEqual(out.catalog.counts, { outfit: 1, necklace: 1, earrings: 0, lipstick: 0 });
});

test('import: tokens are stored hashed, share link cannot manage, wrong token reveals nothing', async () => {
  const { catalogs, repo } = build({ images: IMAGES });
  const { tokens } = await catalogs.createFromImport({ name: 'Priya Silks', content: FILE });
  const stored = JSON.stringify([...repo.catalogs.values()]);
  assert.ok(!stored.includes(tokens.share) && !stored.includes(tokens.manage));

  assert.equal((await catalogs.open(tokens.share)).catalog.role, 'viewer');
  assert.equal((await catalogs.open(tokens.manage)).catalog.role, 'owner');
  await assert.rejects(catalogs.importInto(tokens.share, { content: FILE }), { code: 'CATALOG_FORBIDDEN' });
  await assert.rejects(catalogs.removeCatalog(tokens.share), { code: 'CATALOG_FORBIDDEN' });
  await assert.rejects(catalogs.open('ensc_notarealtokennotarealtoken'), { code: 'CATALOG_NOT_FOUND' });
  await assert.rejects(catalogs.open(''), { code: 'CATALOG_NOT_FOUND' });
});

test('import: nothing valid is rejected with the full report and creates no catalog', async () => {
  const { catalogs, repo } = build({ images: IMAGES });
  const bad = 'name,type,price,image_url\nA,outfit,abc,https://shop.test/saree.png';
  await assert.rejects(catalogs.createFromImport({ name: 'Nope', content: bad }), (e) => e.code === 'IMPORT_REJECTED' && e.details.report.totals.rejected === 1);
  assert.equal(repo.catalogs.size, 0);
  await assert.rejects(catalogs.createFromImport({ name: ' ', content: FILE }), { code: 'INVALID_INPUT' });
});

test('import: append updates by id, replace removes the rest, and stored images are cleaned up', async () => {
  const storage = createMemoryStorage({ configured: true });
  const { catalogs } = build({ images: IMAGES, storage });
  const created = await catalogs.createFromImport({ name: 'Priya Silks', content: FILE });
  const { tokens } = created;
  assert.ok(created.items.every((i) => i.imageUrl.startsWith('https://cdn.test/ensemble-catalog/')));
  assert.equal(created.items.find((i) => i.id === 's1').colourSource, 'image', 'local PNG colours used when storage returns none');
  assert.equal(storage.assets.size, 2);

  const more = 'id,type,name,price,image_url,formality,metal_tone\nE1,earrings,Gold jhumka,3200,https://shop.test/necklace.png,5,gold\nS1,outfit,Maroon saree v2,15000,https://shop.test/saree.png,5,';
  const appended = await catalogs.importInto(tokens.manage, { content: more });
  assert.equal(appended.report.totals.updated, 1);
  assert.equal(appended.catalog.itemCount, 3);
  assert.equal(appended.items.find((i) => i.id === 's1').price, 15000);

  const replaced = await catalogs.importInto(tokens.manage, { content: more, mode: 'replace' });
  assert.equal(replaced.catalog.itemCount, 2);
  assert.equal(replaced.report.totals.removed, 1);
  assert.ok(!storage.assets.has('ensemble-catalog/' + created.catalog.id + '/n1'), 'removed item image deleted from storage');

  const after = await catalogs.removeItem(tokens.manage, 'e1');
  assert.equal(after.catalog.itemCount, 1);
  await assert.rejects(catalogs.removeItem(tokens.manage, 'e1'), { code: 'NOT_FOUND' });
  await catalogs.removeCatalog(tokens.manage);
  assert.equal(storage.assets.size, 0);
  await assert.rejects(catalogs.open(tokens.share), { code: 'CATALOG_NOT_FOUND' });
});

test('catalog size limit holds', async () => {
  const { catalogs } = build({ images: IMAGES });
  const { tokens } = await catalogs.createFromImport({ name: 'Big', content: FILE });
  const rows = (from) => ['name,type,price,image_url,formality', ...Array.from({ length: 60 }, (_, i) => `Item ${from + i},outfit,1000,https://shop.test/saree.png,3`)].join('\n');
  await catalogs.importInto(tokens.manage, { content: rows(0) });
  await catalogs.importInto(tokens.manage, { content: rows(100) });
  await catalogs.importInto(tokens.manage, { content: rows(200) });
  await assert.rejects(catalogs.importInto(tokens.manage, { content: rows(300) }), { code: 'CATALOG_FULL' });
});

test('expired merchant catalogs stop resolving and are swept with their images', async () => {
  let clock = new Date('2026-10-20T00:00:00Z');
  const storage = createMemoryStorage({ configured: true });
  const repo = createMemoryCatalogRepo();
  const importer = createImporter({ fetcher: fakeFetcher(IMAGES), storage, logger: silentLogger });
  const catalogs = createCatalogService({ repo, importer, storage, config: { catalogTtlDays: 30 }, logger: silentLogger, now: () => clock });
  await catalogs.ensureSample();
  const { tokens } = await catalogs.createFromImport({ name: 'Temp', content: FILE });
  clock = new Date('2026-11-25T00:00:00Z');
  await assert.rejects(catalogs.open(tokens.share), { code: 'CATALOG_NOT_FOUND' });
  assert.deepEqual(await catalogs.sweepExpired(), { swept: 1 });
  assert.equal(storage.assets.size, 0);
  assert.ok(await repo.getCatalog(SAMPLE_CATALOG_ID), 'the sample catalog never expires');
});

// ---- sample catalog ----
test('sample catalog: 12/6/6/6, valid, original, seeded once, ready for the planner', async () => {
  const count = (t) => SAMPLE_ITEMS.filter((i) => i.type === t).length;
  assert.deepEqual([count('outfit'), count('necklace'), count('earrings'), count('lipstick')], [12, 6, 6, 6]);
  assert.equal(new Set(SAMPLE_ITEMS.map((i) => i.itemId)).size, SAMPLE_ITEMS.length);
  for (const i of SAMPLE_ITEMS) {
    assert.ok(i.price >= LIMITS.price.min && i.formality >= 1 && i.formality <= 5, i.itemId);
    assert.ok(i.colours.length >= 1 && i.colours.every((c) => COLOUR_FAMILIES[c.family] && /^#[0-9A-F]{6}$/.test(c.hex)), i.itemId);
    assert.ok(i.occasions.every((o) => occasionIds.includes(o)), i.itemId);
    if (i.type === 'outfit') assert.ok(i.garmentCategory);
    if (i.type === 'necklace' || i.type === 'earrings') assert.ok(i.metalTone);
    assert.ok(i.prompt && !/brand|logo/i.test(i.prompt.replace(/no brand/i, '')), i.itemId);
  }
  // Every occasion has at least one outfit, and the cheapest look (outfit + lipstick) is a real number for the "nothing fits" path.
  for (const o of occasionIds) assert.ok(SAMPLE_ITEMS.some((i) => i.type === 'outfit' && i.occasions.includes(o)), o);
  const cheapest = Math.min(...SAMPLE_ITEMS.filter((i) => i.type === 'outfit').map((i) => i.price)) + Math.min(...SAMPLE_ITEMS.filter((i) => i.type === 'lipstick').map((i) => i.price));
  assert.ok(cheapest > 2000 && cheapest < 5000);

  const { catalogs, repo } = build({ images: {} });
  assert.equal((await catalogs.ensureSample()).seeded, true);
  assert.equal((await catalogs.ensureSample()).seeded, false);
  const s = await catalogs.getSample();
  assert.equal(s.items.length, 30);
  assert.ok(s.items.every((i) => i.source === 'sample' && i.imageUrl.startsWith('https://app.test/catalog/sample/')), 'image urls are absolute for server-side use');
  assert.ok(!('prompt' in (await repo.listItems(SAMPLE_CATALOG_ID))[0]));
  // Stable order for a deterministic planner
  assert.deepEqual(s.items.map((i) => i.id), (await catalogs.getSample()).items.map((i) => i.id));

  // Sessions without a choice plan from the sample; a session pointing at a gone catalog falls back.
  assert.equal((await catalogs.itemsForSession({})).catalog.id, 'sample');
  const gone = await catalogs.itemsForSession({ catalogId: 'deleted' });
  assert.equal(gone.fellBack, true); assert.equal(gone.items.length, 30);
});

test('sample images exist on disk and read back as their declared colours', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const dir = fileURLToPath(new URL('../../client/public/catalog/sample/', import.meta.url));
  for (const i of SAMPLE_ITEMS) {
    const buf = await readFile(`${dir}${i.itemId}.png`);
    const check = checkImage(buf, i.type);
    assert.deepEqual(check.errors, [], i.itemId);
    if (i.type === 'outfit') assert.equal(check.pixels.colours[0].family, i.colours[0].family, i.itemId);
  }
});
