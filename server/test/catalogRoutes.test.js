import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { RequestQueue } from '../src/lib/requestQueue.js';
import { createMemoryLedger } from '../src/services/ledger.js';
import { createImporter } from '../src/services/catalog/importer.js';
import { createCatalogService } from '../src/services/catalog/service.js';
import { createMemoryCatalogRepo } from '../src/services/catalog/repoMemory.js';
import { encodePng } from '../src/lib/pngEncode.js';
import { seedFixture } from './fixtures/seedFixture.js';
import { silentLogger, createMemorySessions, createMemoryStorage } from './helpers.js';

function png(w, h) {
  const data = Buffer.alloc(w * h * 4, 255);
  for (let y = Math.floor(h * 0.1); y < h * 0.9; y++) for (let x = Math.floor(w * 0.25); x < w * 0.75; x++) { const k = (y * w + x) * 4; data[k] = 110; data[k + 1] = 26; data[k + 2] = 45; }
  return encodePng({ width: w, height: h, data });
}
const IMAGES = { 'https://shop.test/saree.png': png(500, 700) };
const fetcher = { fetchImage: async (url) => { if (!IMAGES[url]) { const e = new Error('The image link answered with status 404.'); throw e; } return { buffer: IMAGES[url], contentType: 'image/png' }; } };

async function boot() {
  const storage = createMemoryStorage({ configured: true });
  const repo = createMemoryCatalogRepo();
  const sessions = createMemorySessions();
  const config = { clientOrigins: [], enableDevRoutes: false, sessionUnitCap: 50, globalDailyUnitCap: 100, publicClientUrl: 'https://app.test', catalogImportsPerHour: 100 };
  const catalogs = createCatalogService({ repo, importer: createImporter({ fetcher, storage, logger: silentLogger }), storage, sessions, config, logger: silentLogger });
  await seedFixture(repo);
  const app = createApp({ config, logger: silentLogger, gateway: {}, ledger: createMemoryLedger(), queue: new RequestQueue({ concurrency: 1 }), sessions, storage, catalogs, dbState: () => 'connected' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = (path, { method = 'POST', body, token, headers = {} } = {}) =>
    fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const upload = (path, { text, filename = 'catalog.csv', token, extra = {} }) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(extra)) f.append(k, v);
    f.append('file', new Blob([text], { type: 'text/plain' }), filename);
    return fetch(`${base}${path}`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: f });
  };
  const retailer = async (email, businessName) => {
    const res = await json('/api/auth/retailer/register', { body: { email, password: 'Silk&Zari-2026', name: 'Owner', businessName, phone: '9876543210', city: 'Pune', acceptTerms: true } });
    assert.equal(res.status, 201);
    return res.json();
  };
  return { base, json, upload, retailer, sessions, close: () => { server.closeAllConnections?.(); server.close(); } };
}

const CSV = 'id,type,name,price,image_url,formality,occasion_tags\nS1,outfit,Maroon saree,14500,https://shop.test/saree.png,5,wedding-guest\nS2,outfit,Broken,100,https://shop.test/missing.png,5,';

test('shared catalog: open to everyone, shows retailer uploads at once, no link needed', async () => {
  const t = await boot();
  try {
    const before = await (await fetch(`${t.base}/api/catalog`)).json();
    assert.equal(before.catalog.itemCount, 30);
    assert.equal((await fetch(`${t.base}/api/catalog`)).headers.get('cache-control'), 'no-cache');

    const cfg = await (await fetch(`${t.base}/api/catalog/config`)).json();
    assert.equal(cfg.limits.maxRowsPerImport, 60);
    const tpl = await fetch(`${t.base}/api/catalog/template`);
    assert.match(tpl.headers.get('content-disposition'), /template\.csv/);

    const { token } = await t.retailer('p@shop.in', 'Priya Silks');
    const res = await t.upload('/api/retailer/uploads', { text: CSV, token, filename: 'festive.csv' });
    assert.equal(res.status, 201);
    const made = await res.json();
    assert.equal(made.report.totals.imported, 1);
    assert.equal(made.report.totals.rejected, 1);

    // A shopper with no account and no link sees it.
    const after = await (await fetch(`${t.base}/api/catalog`)).json();
    assert.equal(after.catalog.itemCount, 31);
    const saree = after.items.find((i) => i.sku === 's1');
    assert.equal(saree.seller, 'Priya Silks');
    assert.ok(after.catalog.sellers.includes('Priya Silks'));
  } finally { t.close(); }
});

test('retailer dashboard: sign-in required, keeps every upload, deletes an item everywhere', async () => {
  const t = await boot();
  try {
    assert.equal((await fetch(`${t.base}/api/retailer/dashboard`)).status, 401);
    const a = await t.retailer('a@shop.in', 'Priya Silks');
    const b = await t.retailer('b@shop.in', 'Kavya Jewels');

    await t.upload('/api/retailer/uploads', { text: CSV, token: a.token, filename: 'one.csv' });
    await t.upload('/api/retailer/uploads', { text: 'id,type,name,price,image_url,formality\nS9,outfit,Second,2000,https://shop.test/saree.png,3', token: a.token, filename: 'two.csv' });
    await t.upload('/api/retailer/uploads', { text: CSV, token: b.token, filename: 'b.csv' });

    // "Log out and back in": everything is still there, from the server.
    const again = await (await t.json('/api/auth/retailer/login', { body: { email: 'a@shop.in', password: 'Silk&Zari-2026' } })).json();
    const board = await (await t.json('/api/retailer/dashboard', { method: 'GET', token: again.token })).json();
    assert.equal(board.summary.items, 2);
    assert.deepEqual(board.uploads.map((u) => u.fileName).sort(), ['one.csv', 'two.csv']);

    // Another retailer cannot touch it; the owner can delete it.
    const id = board.items.find((i) => i.sku === 's1').id;
    assert.equal((await t.json(`/api/retailer/items/${id}`, { method: 'DELETE', token: b.token })).status, 404);
    const del = await t.json(`/api/retailer/items/${id}`, { method: 'DELETE', token: again.token });
    assert.equal(del.status, 200);
    assert.equal((await del.json()).summary.items, 1);
    const shop = await (await fetch(`${t.base}/api/catalog`)).json();
    assert.ok(!shop.items.some((i) => i.id === id), 'gone from the shared catalog');
    assert.equal(shop.catalog.itemCount, 30 + 2); // 30 fixture + A's 1 + B's 1

    // A shopper token is not a retailer token.
    const shopper = await (await t.json('/api/auth/shopper/register', { body: { email: 'a@shop.in', password: 'Another#Pass1', acceptRetention: true } })).json();
    assert.equal((await t.json('/api/retailer/dashboard', { method: 'GET', token: shopper.token })).status, 401);
  } finally { t.close(); }
});

test('catalog API: file problems come back as plain, specific errors', async () => {
  const t = await boot();
  try {
    const { token } = await t.retailer('a@shop.in', 'Test shop');
    const bad = await t.upload('/api/retailer/uploads', { text: 'name,type\nA,outfit', token });
    assert.equal(bad.status, 400);
    const e = (await bad.json()).error;
    assert.equal(e.code, 'INVALID_FILE'); assert.match(e.message, /missing: price, image_url/);

    const none = await t.upload('/api/retailer/uploads', { text: 'name,type,price,image_url,formality\nA,outfit,abc,https://shop.test/saree.png,3', token });
    assert.equal(none.status, 422);
    const r = (await none.json()).error;
    assert.equal(r.code, 'IMPORT_REJECTED'); assert.equal(r.details.report.rows[0].errors[0].field, 'price');

    const big = await t.upload('/api/retailer/uploads', { text: 'a'.repeat(600 * 1024), token });
    assert.equal(big.status, 413);

    const noFile = await t.json('/api/retailer/uploads', { body: {}, token });
    assert.equal((await noFile.json()).error.code, 'NO_FILE');
    assert.equal((await t.upload('/api/retailer/uploads', { text: CSV })).status, 401);
  } finally { t.close(); }
});
