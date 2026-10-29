import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { AppError } from '../src/lib/errors.js';
import { RequestQueue } from '../src/lib/requestQueue.js';
import { maskUrl, shortId } from '../src/lib/logIds.js';
import { DEFAULT_LIMITS, resolveLimits } from '../src/config/limits.js';
import { encodeKey, decodeKey } from '../src/config/metrics.js';
import { createMemoryLedger } from '../src/services/ledger.js';
import { createImporter } from '../src/services/catalog/importer.js';
import { createCatalogService } from '../src/services/catalog/service.js';
import { createMemoryCatalogRepo } from '../src/services/catalog/repoMemory.js';
import { seedFixture } from './fixtures/seedFixture.js';
import { createSkinService } from '../src/services/skin/service.js';
import { createRenderService } from '../src/services/render/service.js';
import { createMetrics } from '../src/services/metrics/service.js';
import { createMemoryStatStore } from '../src/services/metrics/storeMemory.js';
import { createPurger } from '../src/services/privacy/purge.js';
import { encodePng } from '../src/lib/pngEncode.js';
import { silentLogger, fakeJpeg, fakePng, createMemorySessions, createMemoryStorage } from './helpers.js';

// ---------- small helpers ----------

function newMetrics(sessions = createMemorySessions(['s1', 's2', 's3'])) {
  const store = createMemoryStatStore();
  return { store, sessions, metrics: createMetrics({ store, sessions, logger: silentLogger }) };
}
const cat = { id: 'main', name: 'Ensemble catalog', source: 'main' };
const item = (id, type = 'outfit', name = id, price = 1000) => ({ id, type, name, price });
const settleMicro = () => new Promise((r) => setTimeout(r, 15));

// ---------- counters ----------

test('counters: a session counts once, "nothing within budget" counts once, empty until something happens', async () => {
  const { metrics } = newMetrics();
  assert.equal((await metrics.report(cat, [])).empty, true);

  await metrics.planned({ _id: 's1', catalogId: 'main' }, { status: 'ok' });
  await metrics.planned({ _id: 's1', catalogId: 'main' }, { status: 'ok' }); // same session again
  await metrics.planned({ _id: 's2', catalogId: 'main' }, { status: 'over_budget' });
  await metrics.planned({ _id: 's2', catalogId: 'main' }, { status: 'over_budget' }); // the same miss again
  await metrics.planned({ _id: 's3', catalogId: 'an-old-private-catalog' }, { status: 'ok' }); // an old session pointing elsewhere still counts under the shared catalog

  const r = await metrics.report(cat, []);
  assert.equal(r.empty, false);
  assert.equal(r.totals.sessions, 3);
  assert.equal(r.totals.nothingWithinBudget, 1);
});

test('counters: looks, most chosen items (with names, and ids for removed items), units, refinements', async () => {
  const { metrics } = newMetrics();
  const c = { catalogId: 'main' };
  await metrics.lookStarted(c, { outfit: item('saree-a'), lipstick: item('red', 'lipstick') });
  await metrics.lookStarted(c, { outfit: item('saree-a'), necklace: item('gold-choker', 'necklace') });
  await metrics.lookStarted(c, { outfit: item('lehenga.b') }); // a dot in an id must survive
  await metrics.unitsSpent(c, { units: 2, firstForLook: true });
  await metrics.unitsSpent(c, { units: 1, firstForLook: false });
  await metrics.unitsSpent(c, { units: 1, firstForLook: true });
  await metrics.unitsSpent(c, { units: 0, firstForLook: true }); // a cached stage costs nothing and counts for nothing
  await metrics.refined(c, ['change_lipstick', 'change_lipstick', 'make_cheaper', 'not_a_real_op']);
  await metrics.refined(c, ['change_lipstick']);

  const r = await metrics.report(cat, [item('saree-a', 'outfit', 'Maroon saree', 14500), item('red', 'lipstick', 'Classic red', 900)]);
  assert.equal(r.totals.looksGenerated, 3);
  assert.equal(r.totals.looksDrawn, 2);
  assert.equal(r.totals.units, 4);
  assert.equal(r.totals.avgUnitsPerLook, 2);
  assert.deepEqual(r.topItems[0], { id: 'saree-a', name: 'Maroon saree', type: 'outfit', price: 14500, picks: 2, inCatalog: true });
  const removed = r.topItems.find((x) => x.id === 'gold-choker');
  assert.equal(removed.inCatalog, false);
  assert.equal(removed.name, 'gold-choker');
  assert.ok(r.topItems.some((x) => x.id === 'lehenga.b'));
  assert.deepEqual(r.refinements.map((x) => [x.op, x.count]), [['change_lipstick', 2], ['make_cheaper', 1], ['other', 1]].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  assert.equal(r.refinements[0].label, 'Changed the lipstick shade');
  assert.match(r.note, /never include photos/);
});

test('counters: a failing store never breaks the caller', async () => {
  const store = { inc: async () => { throw new Error('mongo is down'); }, get: async () => null, delete: async () => {} };
  const metrics = createMetrics({ store, sessions: createMemorySessions(['s1']), logger: silentLogger });
  await metrics.planned({ _id: 's1', catalogId: 'main' }, { status: 'ok' }); // resolves, does not throw
  await metrics.lookStarted({ catalogId: 'main' }, { outfit: item('a') });
  assert.ok(true);
});

test('counter keys: ids with dots, dollar signs and slashes round-trip', () => {
  for (const id of ['a.b', '$set', 'x/y', 'saree 1', 'साड़ी']) assert.equal(decodeKey(encodeKey(id)), id);
  assert.ok(!encodeKey('a.b').includes('.'));
  assert.ok(!encodeKey('$x').startsWith('$'));
});

test('CSV: one flat table, formulas made harmless, quotes escaped, numbers as numbers', async () => {
  const { metrics } = newMetrics();
  const c = { catalogId: 'main' };
  await metrics.planned({ _id: 's1', catalogId: 'main' }, { status: 'ok' });
  await metrics.lookStarted(c, { outfit: item('evil') });
  await metrics.unitsSpent(c, { units: 3, firstForLook: true });
  const report = await metrics.report(cat, [item('evil', 'outfit', '=HYPERLINK("http://x","click")', 1)]);
  const csv = metrics.toCsv(report);
  assert.ok(csv.startsWith('﻿section,key,label,value\r\n'));
  assert.match(csv, /total,sessions,Sessions that planned a look,1\r\n/);
  assert.match(csv, /total,avg_units_per_look,Average units per drawn look,3\r\n/);
  assert.ok(csv.includes(`item_picks,evil,"'=HYPERLINK(""http://x"",""click"")",1`), csv);
  assert.ok(!/(^|,)=HYPERLINK/m.test(csv));
  // Nothing personal can be in it: only the fixed sections.
  assert.deepEqual([...new Set(csv.split('\r\n').slice(1).filter(Boolean).map((l) => l.split(',')[0]))].sort(), ['item_picks', 'meta', 'total']);
});

// ---------- counters fed by the real services ----------

function fakeGateway() {
  const g = { calls: [], n: 0, deleted: [] };
  g.unitsFor = async () => ({ units: 1, known: true });
  g.deleteTask = async (a) => { g.deleted.push(a); return true; };
  g.runTask = async (args) => {
    g.calls.push(args);
    g.n += 1;
    return { taskId: `t${g.n}`, feature: args.feature, units: 1, unitsKnown: true, stored: [{ publicId: `ensemble/sess-1/out-${g.n}`, width: 100, height: 100 }], results: {}, resultUrls: [] };
  };
  return g;
}

async function bootRender({ configOver = {}, sessionOver = {} } = {}) {
  const storage = createMemoryStorage();
  const config = { sessionUnitCap: 50, globalDailyUnitCap: 100, publicClientUrl: 'https://app.test', render: {}, shareSecret: 'test-secret-test-secret', ...configOver };
  const sessions = createMemorySessions();
  const { store, metrics } = newMetrics(sessions);
  const repo = createMemoryCatalogRepo();
  const catalogs = createCatalogService({ repo, importer: createImporter({ fetcher: {}, storage, logger: silentLogger }), storage, metrics, config, logger: silentLogger });
  await seedFixture(repo);
  const d = sessions.docs.get('sess-1');
  d.consent = { over18: true, ownPhotos: false };
  d.preferences = { occasion: 'wedding-guest', occasionText: '', budgetInr: 25000, silhouettes: [], metal: 'any', avoidColours: [], notes: '' };
  d.skinProfile = { selfieKey: 'sample:sample-a', source: 'sample', skin: { hex: '#C08A5E', L: 62, a: 14, b: 26, ita: 25, hue: 59, chroma: 30 }, depth: { id: 'tan' }, undertone: { id: 'warm', confidence: 'high' }, override: null };
  d.photos = { selfie: { source: 'sample', sampleId: 'sample-a' }, body: { source: 'sample', sampleId: 'sample-a' } };
  Object.assign(d, sessionOver);
  const gateway = fakeGateway();
  const ledger = createMemoryLedger();
  const skin = createSkinService({ gateway: {}, storage, sessions, logger: silentLogger });
  const fetchOwn = async (url) => (url.includes('body') ? fakeJpeg(800, 1400) : url.endsWith('.png') ? fakePng(600, 700) : fakeJpeg(900, 900));
  const renders = createRenderService({ gateway, storage, sessions, catalogs, skin, ledger, metrics, config, logger: silentLogger, fetchOwn, safeFetcher: {} });
  const session = () => sessions.get('sess-1');
  const settle = async (id) => {
    for (let i = 0; i < 400; i++) {
      const l = await renders.get(await session(), id);
      if (!l.active) return l;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('look never finished');
  };
  const report = async () => { await settleMicro(); return metrics.report({ id: 'main', name: 'Ensemble catalog', source: 'main' }, (await catalogs.getMain()).items); };
  return { renders, gateway, sessions, storage, session, settle, store, metrics, report, catalogs, ledger, config };
}
const IDS = { outfit: 'outfit-ivory-kurta', necklace: 'necklace-oxidised-choker', earrings: 'earrings-pearl-drop', lipstick: 'lipstick-classic-red' };
const itemIds = (over = {}) => Object.values({ ...IDS, ...over }).filter(Boolean);

test('retailer counters fill from real renders: looks, units, a repeat is free, a retry is not a new look', async () => {
  const t = await bootRender();
  const a = await t.renders.start(await t.session(), { itemIds: itemIds() });
  await t.settle(a.id);
  let r = await t.report();
  assert.equal(r.totals.looksGenerated, 1);
  assert.equal(r.totals.looksDrawn, 1);
  assert.equal(r.totals.units, 4);
  assert.equal(r.totals.avgUnitsPerLook, 4);
  assert.equal(r.topItems.length, 4);
  assert.ok(r.topItems.every((x) => x.picks === 1 && x.inCatalog));

  // Same look again: cached, free, and not counted as a new look.
  const again = await t.renders.start(await t.session(), { itemIds: itemIds() });
  await t.settle(again.id);
  r = await t.report();
  assert.equal(r.totals.looksGenerated, 1);
  assert.equal(r.totals.units, 4);

  // Only the lipstick changes: a new look that costs one unit.
  const b = await t.renders.start(await t.session(), { itemIds: itemIds({ lipstick: 'lipstick-berry' }) });
  await t.settle(b.id);
  r = await t.report();
  assert.equal(r.totals.looksGenerated, 2);
  assert.equal(r.totals.looksDrawn, 2);
  assert.equal(r.totals.units, 5);
  assert.equal(r.totals.avgUnitsPerLook, 2.5);
  assert.equal(r.topItems.find((x) => x.id === IDS.outfit).picks, 2);
});

test('counters always land under the shared catalog, whatever catalog id an old session carries', async () => {
  const t = await bootRender();
  await t.metrics.planned({ _id: 'sess-1', catalogId: 'merchant-1' }, { status: 'ok' });
  await t.metrics.lookStarted({ catalogId: 'merchant-1' }, { outfit: item('x') });
  assert.equal((await t.store.get('main')).looksGenerated, 1);
  assert.equal(await t.store.get('merchant-1'), null);
});

test('retailer report: only their items, picks per item, and deleted items drop out of the counters', async () => {
  const { metrics, store } = newMetrics();
  await metrics.lookStarted({}, { outfit: item('ra1-s1'), lipstick: item('l-501', 'lipstick') });
  await metrics.lookStarted({}, { outfit: item('ra1-s1') });
  const mine = [{ id: 'ra1-s1', sku: 's1', name: 'Maroon saree', type: 'outfit', price: 14500 }, { id: 'ra1-n1', sku: 'n1', name: 'Gold necklace', type: 'necklace', price: 6200 }];
  let r = await metrics.retailerReport(mine);
  assert.equal(r.empty, false);
  assert.deepEqual(r.totals, { itemsListed: 2, itemsPicked: 1, picks: 2 });
  assert.deepEqual(r.topItems.map((x) => [x.sku, x.picks]), [['s1', 2]]);
  assert.equal(r.notYetPicked, 1);
  assert.ok(!JSON.stringify(r).includes('l-501'), 'other sellers\' items never show');
  assert.match(metrics.retailerCsv(r, mine), /s1,Maroon saree,outfit,14500,2\r\n.*n1,Gold necklace,necklace,6200,0/s);

  await metrics.removeItems('main', ['ra1-s1']);
  await settleMicro();
  assert.equal((await store.get('main')).itemPicks[encodeKey('ra1-s1')], undefined);
  r = await metrics.retailerReport([mine[1]]);
  assert.equal(r.empty, true);
});

// ---------- caps stop spending cleanly ----------

test('caps: the session unit cap stops a look before any unit is spent, and drawn looks stay', async () => {
  const t = await bootRender({ configOver: { sessionUnitCap: 5 } });
  const first = await t.renders.start(await t.session(), { itemIds: itemIds() }); // 4 units of 5
  await t.settle(first.id);
  t.ledger.record({ sessionId: 'sess-1', kind: 'task', success: true, units: 4 }); // the gateway records these in production
  const before = t.gateway.calls.length;
  await assert.rejects(
    t.renders.start(await t.session(), { itemIds: itemIds({ outfit: 'outfit-maroon-silk-saree', lipstick: 'lipstick-berry' }) }),
    (e) => e instanceof AppError && e.code === 'SESSION_CAP' && e.status === 429,
  );
  assert.equal(t.gateway.calls.length, before, 'nothing was sent to YouCam');
  const kept = await t.renders.get(await t.session(), first.id);
  assert.equal(kept.status, 'done', 'the look already drawn stays available');
  assert.equal((await t.report()).totals.looksGenerated, 1, 'a refused look is not counted as drawn');

  // Once the cap allows it, the same look draws, and counts exactly once (even if started twice).
  t.config.sessionUnitCap = 100;
  const ids = itemIds({ outfit: 'outfit-maroon-silk-saree', lipstick: 'lipstick-berry' });
  const retry = await t.renders.start(await t.session(), { itemIds: ids });
  await t.settle(retry.id);
  await t.renders.start(await t.session(), { itemIds: ids }).then((l) => t.settle(l.id));
  assert.equal((await t.report()).totals.looksGenerated, 2);
});

test('caps: the daily cap and the per-session render cap stop cleanly too', async () => {
  const daily = await bootRender({ configOver: { globalDailyUnitCap: 3 } });
  await assert.rejects(daily.renders.start(await daily.session(), { itemIds: itemIds() }), (e) => e.code === 'GLOBAL_CAP');
  assert.equal(daily.gateway.calls.length, 0);

  const renders = await bootRender({ configOver: { render: { sessionRenderCap: 3 } } });
  await assert.rejects(renders.renders.start(await renders.session(), { itemIds: itemIds() }), (e) => e.code === 'RENDER_CAP');
  assert.equal(renders.gateway.calls.length, 0);
});

// ---------- per-IP limits ----------

async function bootApp({ limits, sessions = createMemorySessions(), purger, extra = {} } = {}) {
  const storage = createMemoryStorage();
  const config = { clientOrigins: [], enableDevRoutes: false, sessionUnitCap: 50, globalDailyUnitCap: 100, publicClientUrl: 'https://app.test', limits, ...extra.config };
  const app = createApp({ config, logger: silentLogger, gateway: {}, ledger: createMemoryLedger(), queue: new RequestQueue({ concurrency: 1 }), sessions, storage, dbState: () => 'connected', purger, ...extra.deps });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  return { base: `http://127.0.0.1:${server.address().port}`, sessions, storage, close: () => { server.closeAllConnections?.(); server.close(); } };
}

test('limits: defaults, overrides, zero turns a limit off', () => {
  assert.deepEqual(resolveLimits(), DEFAULT_LIMITS);
  assert.equal(resolveLimits({ rendersPerHour: 3 }).rendersPerHour, 3);
  assert.equal(resolveLimits({ rendersPerHour: -1, skinPerHour: 'x' }).rendersPerHour, DEFAULT_LIMITS.rendersPerHour);
  assert.equal(resolveLimits({ uploadsPerHour: 0 }).uploadsPerHour, 0);
});

test('limits: a costly route answers 429 RATE_LIMITED with Retry-After once the per-IP limit is used', async () => {
  const t = await bootApp({ limits: { rendersPerHour: 2, agentTurnsPerHour: 1 } });
  try {
    const post = (path) => fetch(`${t.base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    // Without a session these answer 401, which is how we know the request got past the limiter.
    assert.equal((await post('/api/sessions/me/looks')).status, 401);
    assert.equal((await post('/api/sessions/me/looks/look_abcdef0123/render')).status, 401); // shares the same allowance
    const blocked = await post('/api/sessions/me/looks');
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get('retry-after'));
    const body = await blocked.json();
    assert.equal(body.error.code, 'RATE_LIMITED');
    assert.equal(body.error.details.limiter, 'renders');
    assert.match(body.error.message, /already drawn stay available/);

    // A different route has its own allowance.
    assert.equal((await post('/api/sessions/me/agent/turn')).status, 401);
    assert.equal((await post('/api/sessions/me/agent/turn')).status, 429);
    // And cheap routes are untouched.
    assert.equal((await fetch(`${t.base}/api/intake/config`)).status, 200);
  } finally { t.close(); }
});

test('limits: uploads and skin readings are limited, and 0 leaves a route open', async () => {
  const t = await bootApp({ limits: { uploadsPerHour: 1, skinPerHour: 0 } });
  try {
    const put = () => fetch(`${t.base}/api/sessions/me/photos/selfie`, { method: 'PUT' });
    assert.equal((await put()).status, 401);
    assert.equal((await put()).status, 429);
    for (let i = 0; i < 5; i++) assert.equal((await fetch(`${t.base}/api/sessions/me/skin-profile`, { method: 'POST' })).status, 401);
  } finally { t.close(); }
});

test('limits: the global per-IP limit applies to every /api route', async () => {
  const t = await bootApp({ limits: { requestsPerMinute: 3 } });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await fetch(`${t.base}/api/intake/config`)).status, 200);
    const r = await fetch(`${t.base}/api/intake/config`);
    assert.equal(r.status, 429);
    assert.equal((await r.json()).error.code, 'RATE_LIMITED');
    assert.equal((await fetch(`${t.base}/healthz`)).status, 200, 'the health check is outside /api');
  } finally { t.close(); }
});

// ---------- retailer routes ----------

function png(w, h) {
  const data = Buffer.alloc(w * h * 4, 255);
  for (let y = Math.floor(h * 0.1); y < h * 0.9; y++) for (let x = Math.floor(w * 0.25); x < w * 0.75; x++) { const k = (y * w + x) * 4; data[k] = 110; data[k + 1] = 26; data[k + 2] = 45; }
  return encodePng({ width: w, height: h, data });
}
const IMAGES = { 'https://shop.test/saree.png': png(500, 700) };
const fetcher = { fetchImage: async (url) => { if (!IMAGES[url]) throw new Error('404'); return { buffer: IMAGES[url], contentType: 'image/png' }; } };

test('retailer usage API: signed-in retailer only, honest empty state, their items only, CSV', async () => {
  const storage = createMemoryStorage({ configured: false });
  const sessions = createMemorySessions(['sess-1']);
  const { metrics } = newMetrics(sessions);
  const config = { clientOrigins: [], enableDevRoutes: false, sessionUnitCap: 50, globalDailyUnitCap: 100, publicClientUrl: 'https://app.test', catalogImportsPerHour: 100 };
  const repo = createMemoryCatalogRepo();
  const catalogs = createCatalogService({ repo, importer: createImporter({ fetcher, storage, logger: silentLogger }), storage, metrics, config, logger: silentLogger });
  await seedFixture(repo);
  const app = createApp({ config, logger: silentLogger, gateway: {}, ledger: createMemoryLedger(), queue: new RequestQueue({ concurrency: 1 }), sessions, storage, catalogs, metrics, dbState: () => 'connected' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, token) => fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  try {
    const reg = await fetch(`${base}/api/auth/retailer/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'p@shop.in', password: 'Silk&Zari-2026', name: 'Priya', businessName: 'Priya Silks', phone: '9876543210', city: 'Pune', acceptTerms: true }) });
    assert.equal(reg.status, 201);
    const { token, account } = await reg.json();
    const f = new FormData();
    f.append('file', new Blob(['id,type,name,price,image_url,formality,occasion_tags\nS1,outfit,Maroon saree,14500,https://shop.test/saree.png,5,wedding-guest'], { type: 'text/plain' }), 'c.csv');
    const up = await fetch(`${base}/api/retailer/uploads`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: f });
    assert.equal(up.status, 201);
    const id = `${account.retailer.code}-s1`;

    assert.equal((await get('/api/retailer/stats')).status, 401);
    assert.equal((await get('/api/retailer/stats', 'x'.repeat(40))).status, 401);

    let r = await (await get('/api/retailer/stats', token)).json();
    assert.equal(r.empty, true);
    assert.deepEqual(r.totals, { itemsListed: 1, itemsPicked: 0, picks: 0 });

    await metrics.lookStarted({}, { outfit: { id, type: 'outfit' }, lipstick: { id: 'someone-elses', type: 'lipstick' } });
    r = await (await get('/api/retailer/stats', token)).json();
    assert.equal(r.empty, false);
    assert.deepEqual(r.topItems.map((x) => [x.sku, x.name, x.picks]), [['s1', 'Maroon saree', 1]]);
    assert.ok(!JSON.stringify(r).includes('someone-elses'));

    const csvRes = await get('/api/retailer/stats.csv', token);
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get('content-disposition'), /ensemble-usage-priya-silks\.csv/);
    assert.match(await csvRes.text(), /s1,Maroon saree,outfit,14500,1/);
  } finally { server.closeAllConnections?.(); server.close(); }
});

// ---------- deletion ----------

function seedExpired(sessions, id, { renderCache = [] } = {}) {
  sessions.docs.set(id, { _id: id, expiresAt: new Date(Date.now() - 60_000), photos: {}, renderCache });
}
function purgerFor({ sessions, storage, gateway, ledger = createMemoryLedger(), deleteTasks = true }) {
  return createPurger({ sessions, storage, gateway, ledger, logger: silentLogger, deleteTasks });
}

test('deletion sweep: expired sessions lose stored images, YouCam tasks, and their record; live sessions are untouched', async () => {
  const sessions = createMemorySessions(['live']);
  const storage = createMemoryStorage();
  await storage.saveBuffer({ sessionId: 'old', buffer: Buffer.from('a'), kind: 'selfie' });
  await storage.saveBuffer({ sessionId: 'old', buffer: Buffer.from('b'), kind: 'body' });
  await storage.saveBuffer({ sessionId: 'live', buffer: Buffer.from('c'), kind: 'selfie' });
  seedExpired(sessions, 'old', { renderCache: [{ key: 'k1', taskId: 'task-1', feature: 'cloth-v4' }, { key: 'k2', taskId: 'task-2', feature: 'makeup-vto' }] });
  const gateway = fakeGateway();
  const purger = purgerFor({ sessions, storage, gateway });

  const out = await purger.sweepExpired();
  assert.deepEqual(out, { swept: 1, failed: 0 });
  assert.equal(sessions.docs.has('old'), false);
  assert.equal(sessions.docs.has('live'), true);
  assert.deepEqual([...storage.assets.values()], ['live'], 'only the live session still has files');
  assert.deepEqual(gateway.deleted.map((d) => d.taskId).sort(), ['task-1', 'task-2']);
  const st = purger.status();
  assert.equal(st.lastSwept, 1);
  assert.equal(st.totalSwept, 1);
  assert.ok(st.lastRunAt);
});

test('deletion sweep: tasks YouCam already deleted are not asked again, and the switch can turn task deletion off', async () => {
  const sessions = createMemorySessions([]);
  const storage = createMemoryStorage();
  const ledger = createMemoryLedger();
  await ledger.record({ sessionId: 'old', kind: 'task-delete', taskId: 'task-1', success: true, units: 0 });
  await ledger.record({ sessionId: 'old', kind: 'task-delete', taskId: 'task-2', success: false, units: 0 }); // a failed attempt is retried
  seedExpired(sessions, 'old', { renderCache: [{ key: 'k1', taskId: 'task-1', feature: 'cloth-v4' }, { key: 'k2', taskId: 'task-2', feature: 'makeup-vto' }] });
  const gateway = fakeGateway();
  await purgerFor({ sessions, storage, gateway, ledger }).sweepExpired();
  assert.deepEqual(gateway.deleted.map((d) => d.taskId), ['task-2']);

  seedExpired(sessions, 'old2', { renderCache: [{ key: 'k', taskId: 'task-9', feature: 'cloth-v4' }] });
  const g2 = fakeGateway();
  await purgerFor({ sessions, storage, gateway: g2, deleteTasks: false }).sweepExpired();
  assert.equal(g2.deleted.length, 0);
  assert.equal(sessions.docs.has('old2'), false);
});

test('deletion sweep: if storage cannot be cleared the session stays and is retried, never silently dropped', async () => {
  const sessions = createMemorySessions([]);
  const storage = createMemoryStorage();
  await storage.saveBuffer({ sessionId: 'old', buffer: Buffer.from('a'), kind: 'selfie' });
  seedExpired(sessions, 'old');
  seedExpired(sessions, 'old-b');
  let broken = true;
  const realDelete = storage.deleteSession;
  storage.deleteSession = async (id) => { if (broken && id === 'old') throw new Error('storage is down'); return realDelete(id); };
  const purger = purgerFor({ sessions, storage, gateway: fakeGateway() });

  const first = await purger.sweepExpired();
  assert.deepEqual(first, { swept: 1, failed: 1 });
  assert.equal(sessions.docs.has('old'), true, 'kept so the images can still be found and deleted');
  assert.equal(sessions.docs.has('old-b'), false, 'one failure does not block the others');
  assert.equal(purger.status().lastFailed, 1);
  assert.match(purger.status().lastError, /storage is down/);

  broken = false;
  assert.deepEqual(await purger.sweepExpired(), { swept: 1, failed: 0 });
  assert.equal(sessions.docs.has('old'), false);
  assert.equal(storage.assets.size, 0);
});

test('deletion sweep: overlapping runs are skipped, and an empty run is harmless', async () => {
  const sessions = createMemorySessions([]);
  const storage = createMemoryStorage();
  seedExpired(sessions, 'old');
  let release;
  const gate = new Promise((r) => { release = r; });
  const realDelete = storage.deleteSession;
  storage.deleteSession = async (id) => { await gate; return realDelete(id); };
  const purger = purgerFor({ sessions, storage, gateway: fakeGateway() });
  const a = purger.sweepExpired();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(await purger.sweepExpired(), { skipped: true });
  release();
  assert.deepEqual(await a, { swept: 1, failed: 0 });
  assert.deepEqual(await purger.sweepExpired(), { swept: 0, failed: 0 });
});

test('delete everything: removes stored files, then the session, and asks YouCam to delete the finished tasks', async () => {
  const sessions = createMemorySessions(['sess-1']);
  const storage = createMemoryStorage();
  await storage.saveBuffer({ sessionId: 'sess-1', buffer: Buffer.from('a'), kind: 'selfie' });
  sessions.docs.get('sess-1').renderCache = [{ key: 'k1', taskId: 'task-1', feature: 'cloth-v4' }];
  const gateway = fakeGateway();
  const purger = purgerFor({ sessions, storage, gateway });
  const t = await bootApp({ sessions, purger, extra: { deps: { storage } } });
  try {
    const res = await fetch(`${t.base}/api/sessions/me`, { method: 'DELETE', headers: { 'x-session-id': 'sess-1' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { deleted: true, photosDeleted: 1 });
    assert.equal(sessions.docs.has('sess-1'), false);
    assert.equal(storage.assets.size, 0);
    await settleMicro();
    assert.deepEqual(gateway.deleted.map((d) => d.taskId), ['task-1']);
    // Gone means gone: the same session id no longer works.
    assert.equal((await fetch(`${t.base}/api/sessions/me`, { headers: { 'x-session-id': 'sess-1' } })).status, 401);
  } finally { t.close(); }
});

test('delete everything: a storage failure keeps the session so the person can retry', async () => {
  const sessions = createMemorySessions(['sess-1']);
  const storage = createMemoryStorage();
  storage.deleteSession = async () => { throw new Error('storage is down'); };
  const t = await bootApp({ sessions, purger: purgerFor({ sessions, storage, gateway: fakeGateway() }), extra: { deps: { storage } } });
  try {
    const res = await fetch(`${t.base}/api/sessions/me`, { method: 'DELETE', headers: { 'x-session-id': 'sess-1' } });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.code, 'DELETE_FAILED');
    assert.equal(sessions.docs.has('sess-1'), true);
  } finally { t.close(); }
});

test('system status reports the sweeper and the limits, and nothing secret', async () => {
  const sessions = createMemorySessions([]);
  const purger = purgerFor({ sessions, storage: createMemoryStorage(), gateway: fakeGateway() });
  await purger.sweepExpired();
  const t = await bootApp({ sessions, purger, limits: { rendersPerHour: 7 }, extra: { config: { sessionTtlHours: 24, render: { sessionRenderCap: 30 }, youcam: { apiKey: 'k', baseUrl: 'http://x' } } } });
  try {
    const s = await (await fetch(`${t.base}/api/system/status`)).json();
    assert.equal(s.privacy.sweeper.totalSwept, 0);
    assert.ok(s.privacy.sweeper.lastRunAt);
    assert.equal(s.privacy.sessionTtlHours, 24);
    assert.equal(s.limits.rendersPerHour, 7);
    assert.equal(s.caps.sessionRenders, 30);
  } finally { t.close(); }
});

// ---------- logging ----------

test('logging: share, catalog tokens are masked in URLs and session ids become one-way fingerprints', () => {
  assert.equal(maskUrl('/api/share/abc.def123/image/body'), '/api/share/:token/image/body');
  assert.equal(maskUrl('/s/abc.def123'), '/s/:token');
  assert.equal(maskUrl('/c/ensm_abcdefghijklmnop'), '/c/:token');
  assert.equal(maskUrl('/api/sessions/me/looks?x=1'), '/api/sessions/me/looks?x=1');
  const a = shortId('session-secret-123');
  assert.equal(a, shortId('session-secret-123'));
  assert.notEqual(a, shortId('session-secret-124'));
  assert.equal(a.length, 8);
  assert.ok(!a.includes('session'));
  assert.equal(shortId(null), undefined);
});
