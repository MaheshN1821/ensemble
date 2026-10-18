import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { RequestQueue } from '../src/lib/requestQueue.js';
import { createMemoryLedger } from '../src/services/ledger.js';
import { createImporter } from '../src/services/catalog/importer.js';
import { createCatalogService } from '../src/services/catalog/service.js';
import { createMemoryCatalogRepo } from '../src/services/catalog/repoMemory.js';
import { silentLogger, createMemorySessions, createMemoryStorage } from './helpers.js';

async function boot({ withProfile = true } = {}) {
  const storage = createMemoryStorage();
  const config = { clientOrigins: [], enableDevRoutes: false, sessionUnitCap: 50, globalDailyUnitCap: 100, publicClientUrl: 'https://app.test' };
  const catalogs = createCatalogService({ repo: createMemoryCatalogRepo(), importer: createImporter({ fetcher: {}, storage, logger: silentLogger }), storage, config, logger: silentLogger });
  await catalogs.ensureSample();
  const sessions = createMemorySessions();
  const d = sessions.docs.get('sess-1');
  d.consent = { over18: true, ownPhotos: false };
  d.preferences = { occasion: 'wedding-guest', occasionText: '', budgetInr: 25000, silhouettes: [], metal: 'any', avoidColours: [], notes: '' };
  if (withProfile) d.skinProfile = { selfieKey: 'sample:sample-a', source: 'sample', skin: { hex: '#C08A5E', L: 62, a: 14, b: 26, ita: 25, hue: 59, chroma: 30 }, depth: { id: 'tan' }, undertone: { id: 'warm', confidence: 'high' }, override: null };
  // The real skin service decides whether a stored profile still matches the selfie; here the selfie key is the sample's.
  d.photos = { selfie: { source: 'sample', sampleId: 'sample-a' }, body: { source: 'sample', sampleId: 'sample-a' } };
  const app = createApp({ config, logger: silentLogger, gateway: {}, ledger: createMemoryLedger(), queue: new RequestQueue({ concurrency: 1 }), sessions, storage, catalogs, dbState: () => 'connected' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`${base}/api/sessions/me/plan`, { method: 'POST', headers: { 'x-session-id': 'sess-1', 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { base, post, close: () => { server.closeAllConnections?.(); server.close(); } };
}

test('plan API: three looks within budget, a different budget, and clear errors', async () => {
  const t = await boot();
  try {
    const rules = await (await fetch(`${t.base}/api/planner/rules`)).json();
    assert.equal(rules.weights.length, 5);

    const res = await t.post();
    assert.equal(res.status, 200);
    const plan = await res.json();
    assert.equal(plan.status, 'ok');
    assert.equal(plan.looks.length, 3);
    assert.ok(plan.looks.every((l) => l.totalPrice <= 25000));
    assert.equal(plan.catalog.id, 'sample');

    const small = await (await t.post({ budgetInr: 2000 })).json();
    assert.equal(small.status, 'over_budget');
    assert.equal(small.closest.overBy, 850);

    const bad = await t.post({ budgetInr: 5 });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.code, 'INVALID_INPUT');
    assert.equal((await fetch(`${t.base}/api/sessions/me/plan`, { method: 'POST' })).status, 401);
  } finally { t.close(); }
});

test('plan API: no skin profile yet gives a plain 409', async () => {
  const t = await boot({ withProfile: false });
  try {
    const res = await t.post();
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, 'NO_PROFILE');
  } finally { t.close(); }
});
