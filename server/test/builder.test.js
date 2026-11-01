import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { RequestQueue } from '../src/lib/requestQueue.js';
import { createMemoryLedger } from '../src/services/ledger.js';
import { createImporter } from '../src/services/catalog/importer.js';
import { createCatalogService } from '../src/services/catalog/service.js';
import { createMemoryCatalogRepo } from '../src/services/catalog/repoMemory.js';
import { seedFixture } from './fixtures/seedFixture.js';
import { silentLogger, createMemorySessions, createMemoryStorage } from './helpers.js';

async function boot({ withProfile = true, hidden = [] } = {}) {
  const storage = createMemoryStorage();
  const config = { clientOrigins: [], enableDevRoutes: false, sessionUnitCap: 50, globalDailyUnitCap: 100, publicClientUrl: 'https://app.test' };
  const repo = createMemoryCatalogRepo();
  const catalogs = createCatalogService({ repo, importer: createImporter({ fetcher: {}, storage, logger: silentLogger }), storage, config, logger: silentLogger });
  await seedFixture(repo);
  const sessions = createMemorySessions();
  const d = sessions.docs.get('sess-1');
  d.consent = { over18: true, ownPhotos: false };
  d.preferences = { occasion: 'wedding-guest', occasionText: '', budgetInr: 25000, silhouettes: [], metal: 'any', avoidColours: [], notes: '' };
  if (hidden.length) d.agent = { excludeItemIds: hidden };
  if (withProfile) d.skinProfile = { selfieKey: 'sample:sample-a', source: 'sample', skin: { hex: '#C08A5E', L: 62, a: 14, b: 26, ita: 25, hue: 59, chroma: 30 }, depth: { id: 'tan' }, undertone: { id: 'warm', confidence: 'high' }, override: null };
  d.photos = { selfie: { source: 'sample', sampleId: 'sample-a' }, body: { source: 'sample', sampleId: 'sample-a' } };
  const app = createApp({ config, logger: silentLogger, gateway: {}, ledger: createMemoryLedger(), queue: new RequestQueue({ concurrency: 1 }), sessions, storage, catalogs, dbState: () => 'connected' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'x-session-id': 'sess-1', 'content-type': 'application/json' };
  return {
    base,
    items: () => fetch(`${base}/api/sessions/me/builder/items`, { headers }),
    preview: (body) => fetch(`${base}/api/sessions/me/builder/preview`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) }),
    close: () => { server.closeAllConnections?.(); server.close(); },
  };
}

test('builder items: every pickable item, the saved budget and the budget range', async () => {
  const t = await boot();
  try {
    const res = await t.items();
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.items.length, 30);
    assert.deepEqual(out.catalog.counts, { outfit: 12, necklace: 6, earrings: 6, lipstick: 6 });
    assert.equal(out.budgetInr, 25000);
    assert.equal(out.budget.min, 2000);
    assert.equal((await fetch(`${t.base}/api/sessions/me/builder/items`)).status, 401);
  } finally { t.close(); }
});

test('builder items: things the shopper said never to show stay out of the picker', async () => {
  const t = await boot({ hidden: ['outfit-maroon-silk-saree'] });
  try {
    const out = await (await t.items()).json();
    assert.equal(out.items.some((i) => i.id === 'outfit-maroon-silk-saree'), false);
    assert.equal(out.catalog.counts.outfit, 11);
    const res = await t.preview({ itemIds: ['outfit-maroon-silk-saree'] });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, 'ITEM_NOT_FOUND');
  } finally { t.close(); }
});

test('builder preview: scores a chosen look and totals its price', async () => {
  const t = await boot();
  try {
    const res = await t.preview({ itemIds: ['outfit-maroon-silk-saree', 'necklace-gold-temple', 'earrings-gold-jhumka', 'lipstick-brick'] });
    assert.equal(res.status, 200);
    const { look } = await res.json();
    assert.equal(look.totalPrice, 14500 + 6200 + 3200 + 520);
    assert.equal(look.withinBudget, true);
    assert.equal(look.budgetInr, 25000);
    assert.equal(look.itemIds.length, 4);
    assert.ok(look.score >= 0 && look.score <= 100);
    assert.ok(Array.isArray(look.reasons) && Array.isArray(look.cautions));
    // An outfit on its own is a valid look.
    assert.equal((await t.preview({ itemIds: ['outfit-ivory-kurta'] })).status, 200);
  } finally { t.close(); }
});

test('builder preview: the same pieces get the same id as the planner would give, so a drawn look is reused', async () => {
  const t = await boot();
  try {
    const a = (await (await t.preview({ itemIds: ['outfit-ivory-kurta', 'lipstick-coral'] })).json()).look;
    const b = (await (await t.preview({ itemIds: ['lipstick-coral', 'outfit-ivory-kurta'] })).json()).look;
    assert.equal(a.id, b.id);
    assert.match(a.id, /^look_[a-f0-9]{10}$/);
  } finally { t.close(); }
});

test('builder preview: over budget is an answer, not an error, and a different budget is honoured', async () => {
  const t = await boot();
  try {
    const over = (await (await t.preview({ itemIds: ['outfit-emerald-lehenga', 'necklace-gold-kundan'] })).json()).look;
    assert.equal(over.withinBudget, false);
    assert.equal(over.overBy, 28500 + 8400 - 25000);
    const roomy = (await (await t.preview({ itemIds: ['outfit-emerald-lehenga', 'necklace-gold-kundan'], budgetInr: 40000 })).json()).look;
    assert.equal(roomy.withinBudget, true);
    assert.equal(roomy.budgetInr, 40000);
  } finally { t.close(); }
});

test('builder preview: clear errors for a missing outfit, repeated kinds, unknown items and bad input', async () => {
  const t = await boot();
  try {
    const code = async (body) => { const r = await t.preview(body); return [r.status, (await r.json()).error.code]; };
    assert.deepEqual(await code({ itemIds: ['necklace-gold-temple'] }), [400, 'INVALID_INPUT']);
    assert.deepEqual(await code({ itemIds: ['outfit-ivory-kurta', 'outfit-navy-wrap-dress'] }), [400, 'INVALID_INPUT']);
    assert.deepEqual(await code({ itemIds: ['outfit-ivory-kurta', 'earrings-pearl-drop', 'earrings-silver-studs'] }), [400, 'INVALID_INPUT']);
    assert.deepEqual(await code({ itemIds: ['nothing-here'] }), [409, 'ITEM_NOT_FOUND']);
    assert.deepEqual(await code({ itemIds: [] }), [400, 'INVALID_INPUT']);
    assert.deepEqual(await code({}), [400, 'INVALID_INPUT']);
    assert.deepEqual(await code({ itemIds: ['outfit-ivory-kurta'], budgetInr: 5 }), [400, 'INVALID_INPUT']);
    assert.equal((await fetch(`${t.base}/api/sessions/me/builder/preview`, { method: 'POST' })).status, 401);
  } finally { t.close(); }
});

test('builder: no skin reading yet gives a plain 409 on both routes', async () => {
  const t = await boot({ withProfile: false });
  try {
    for (const res of [await t.items(), await t.preview({ itemIds: ['outfit-ivory-kurta'] })]) {
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error.code, 'NO_PROFILE');
    }
  } finally { t.close(); }
});
