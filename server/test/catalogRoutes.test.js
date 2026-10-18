import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { RequestQueue } from '../src/lib/requestQueue.js';
import { createMemoryLedger } from '../src/services/ledger.js';
import { createImporter } from '../src/services/catalog/importer.js';
import { createCatalogService } from '../src/services/catalog/service.js';
import { createMemoryCatalogRepo } from '../src/services/catalog/repoMemory.js';
import { encodePng } from '../src/lib/pngEncode.js';
import { silentLogger, createMemorySessions, createMemoryStorage } from './helpers.js';

function png(w, h) {
  const data = Buffer.alloc(w * h * 4, 255);
  for (let y = Math.floor(h * 0.1); y < h * 0.9; y++) for (let x = Math.floor(w * 0.25); x < w * 0.75; x++) { const k = (y * w + x) * 4; data[k] = 110; data[k + 1] = 26; data[k + 2] = 45; }
  return encodePng({ width: w, height: h, data });
}
const IMAGES = { 'https://shop.test/saree.png': png(500, 700) };
const fetcher = { fetchImage: async (url) => { if (!IMAGES[url]) { const e = new Error('The image link answered with status 404.'); throw e; } return { buffer: IMAGES[url], contentType: 'image/png' }; } };

async function boot() {
  const storage = createMemoryStorage({ configured: false });
  const repo = createMemoryCatalogRepo();
  const config = { clientOrigins: [], enableDevRoutes: false, sessionUnitCap: 50, globalDailyUnitCap: 100, publicClientUrl: 'https://app.test', catalogImportsPerHour: 100 };
  const catalogs = createCatalogService({ repo, importer: createImporter({ fetcher, storage, logger: silentLogger }), storage, config, logger: silentLogger });
  await catalogs.ensureSample();
  const sessions = createMemorySessions();
  const app = createApp({ config, logger: silentLogger, gateway: {}, ledger: createMemoryLedger(), queue: new RequestQueue({ concurrency: 1 }), sessions, storage, catalogs, dbState: () => 'connected' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const upload = (path, { name, text, filename = 'catalog.csv', token, extra = {} }) => {
    const f = new FormData();
    if (name) f.append('name', name);
    for (const [k, v] of Object.entries(extra)) f.append(k, v);
    f.append('file', new Blob([text], { type: 'text/plain' }), filename);
    return fetch(`${base}${path}`, { method: 'POST', headers: token ? { 'x-catalog-token': token } : {}, body: f });
  };
  return { base, upload, sessions, close: () => { server.closeAllConnections?.(); server.close(); } };
}

const CSV = 'id,type,name,price,image_url,formality,occasion_tags\nS1,outfit,Maroon saree,14500,https://shop.test/saree.png,5,wedding-guest\nS2,outfit,Broken,100,https://shop.test/missing.png,5,';

test('catalog API: sample, template, import with report, private links, session selection', async () => {
  const t = await boot();
  try {
    const sample = await (await fetch(`${t.base}/api/catalog/sample`)).json();
    assert.equal(sample.catalog.itemCount, 30);
    assert.deepEqual(sample.catalog.counts, { outfit: 12, necklace: 6, earrings: 6, lipstick: 6 });
    assert.equal(sample.items[0].source, 'sample');

    const cfg = await (await fetch(`${t.base}/api/catalog/config`)).json();
    assert.equal(cfg.limits.maxRowsPerImport, 60);
    const tpl = await fetch(`${t.base}/api/catalog/template`);
    assert.match(tpl.headers.get('content-disposition'), /template\.csv/);
    assert.match(await tpl.text(), /^id,type,name,price,image_url/);

    // Import: one good row, one bad image. Valid rows are live at once.
    const res = await t.upload('/api/catalogs/import', { name: 'Priya Silks', text: CSV });
    assert.equal(res.status, 201);
    const made = await res.json();
    assert.equal(made.report.totals.imported, 1);
    assert.equal(made.report.totals.rejected, 1);
    assert.equal(made.items.length, 1);

    // The share link views, the manage link manages.
    const open = (token) => fetch(`${t.base}/api/catalogs/mine`, { headers: { 'x-catalog-token': token } });
    assert.equal((await (await open(made.tokens.share)).json()).catalog.role, 'viewer');
    assert.equal((await (await open(made.tokens.manage)).json()).catalog.role, 'owner');
    const noToken = await fetch(`${t.base}/api/catalogs/mine`);
    assert.equal(noToken.status, 404);
    assert.equal((await noToken.json()).error.code, 'CATALOG_NOT_FOUND');
    const forbidden = await t.upload('/api/catalogs/mine/import', { text: CSV, token: made.tokens.share });
    assert.equal(forbidden.status, 403);

    // Session picks the catalog; the planner's entry point returns its items.
    const H = { 'x-session-id': 'sess-1', 'content-type': 'application/json' };
    assert.equal((await (await fetch(`${t.base}/api/sessions/me/catalog`, { headers: H })).json()).catalog.id, 'sample');
    const put = await fetch(`${t.base}/api/sessions/me/catalog`, { method: 'PUT', headers: H, body: JSON.stringify({ token: made.tokens.share }) });
    assert.equal(put.status, 200);
    assert.equal((await put.json()).catalog.name, 'Priya Silks');
    assert.equal((await fetch(`${t.base}/api/sessions/me/catalog`, { method: 'PUT', headers: H, body: JSON.stringify({ token: 'bogus' }) })).status, 404);
    const back = await fetch(`${t.base}/api/sessions/me/catalog`, { method: 'PUT', headers: H, body: JSON.stringify({ sample: true }) });
    assert.equal((await back.json()).catalog.id, 'sample');

    // Delete an item, then the catalog.
    const del = await fetch(`${t.base}/api/catalogs/mine/items/s1`, { method: 'DELETE', headers: { 'x-catalog-token': made.tokens.manage } });
    assert.equal((await del.json()).catalog.itemCount, 0);
    assert.equal((await fetch(`${t.base}/api/catalogs/mine`, { method: 'DELETE', headers: { 'x-catalog-token': made.tokens.manage } })).status, 200);
    assert.equal((await open(made.tokens.share)).status, 404);
  } finally { t.close(); }
});

test('catalog API: file problems come back as plain, specific errors', async () => {
  const t = await boot();
  try {
    const bad = await t.upload('/api/catalogs/import', { name: 'Test shop', text: 'name,type\nA,outfit' });
    assert.equal(bad.status, 400);
    const e = (await bad.json()).error;
    assert.equal(e.code, 'INVALID_FILE'); assert.match(e.message, /missing: price, image_url/);

    const none = await t.upload('/api/catalogs/import', { name: 'Test shop', text: 'name,type,price,image_url,formality\nA,outfit,abc,https://shop.test/saree.png,3' });
    assert.equal(none.status, 422);
    const r = (await none.json()).error;
    assert.equal(r.code, 'IMPORT_REJECTED'); assert.equal(r.details.report.rows[0].errors[0].field, 'price');

    const big = await t.upload('/api/catalogs/import', { name: 'Test shop', text: 'a'.repeat(600 * 1024) });
    assert.equal(big.status, 413);
    assert.equal((await big.json()).error.code, 'INVALID_FILE');

    const noFile = await fetch(`${t.base}/api/catalogs/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal((await noFile.json()).error.code, 'NO_FILE');
  } finally { t.close(); }
});
