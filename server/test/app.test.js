import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createYoucamClient } from '../src/services/youcam/client.js';
import { createGateway } from '../src/services/youcam/gateway.js';
import { createMemoryLedger } from '../src/services/ledger.js';
import { RequestQueue } from '../src/lib/requestQueue.js';
import { startMockYoucam, silentLogger } from './helpers.js';

test('HTTP: session -> real task through the gateway -> ledger', async () => {
  const mock = await startMockYoucam();
  const ledger = createMemoryLedger();
  const queue = new RequestQueue({ concurrency: 3 });
  const config = {
    clientOrigins: ['http://localhost:5173'], enableDevRoutes: true, sessionUnitCap: 50, globalDailyUnitCap: 100,
    youcam: { apiKey: 'test-key', baseUrl: mock.baseUrl },
  };
  const gateway = createGateway({
    client: createYoucamClient({ apiKey: 'test-key', baseUrl: mock.baseUrl }), queue, ledger,
    storage: { isConfigured: () => false }, logger: silentLogger,
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
    config: { unitOverrides: {}, unknownFeatureUnits: 5, sessionUnitCap: 50, globalDailyUnitCap: 100, pollIntervalMs: 1000, taskTimeoutMs: 5000 },
  });
  const sessions = {
    create: async () => ({ id: 'sess-1', expiresAt: new Date(Date.now() + 1000) }),
    get: async (id) => (id === 'sess-1' ? { _id: 'sess-1' } : null),
  };
  const app = createApp({ config, logger: silentLogger, gateway, ledger, queue, sessions, storage: { provider: 'cloudinary', isConfigured: () => false }, dbState: () => 'connected' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);

    const created = await (await fetch(`${base}/api/sessions`, { method: 'POST' })).json();
    assert.equal(created.sessionId, 'sess-1');

    // No session header -> friendly 401
    const noSession = await fetch(`${base}/api/sessions/me/ledger`);
    assert.equal(noSession.status, 401);
    assert.equal((await noSession.json()).error.code, 'SESSION_EXPIRED');

    const form = new FormData();
    form.append('image', new Blob([Buffer.from('fake-image')], { type: 'image/jpeg' }), 'me.jpg');
    const probe = await fetch(`${base}/api/dev/probe/skin-tone`, { method: 'POST', headers: { 'x-session-id': 'sess-1' }, body: form });
    assert.equal(probe.status, 200);
    const probeBody = await probe.json();
    assert.equal(probeBody.units, 3);

    const led = await (await fetch(`${base}/api/sessions/me/ledger`, { headers: { 'x-session-id': 'sess-1' } })).json();
    assert.equal(led.unitsUsed, 3);
    assert.ok(led.entries.some((e) => e.kind === 'task' && e.success));

    const bad = new FormData();
    bad.append('image', new Blob(['x'], { type: 'text/plain' }), 'x.txt');
    const rejected = await fetch(`${base}/api/dev/probe/skin-tone`, { method: 'POST', headers: { 'x-session-id': 'sess-1' }, body: bad });
    assert.equal(rejected.status, 415);

    const status = await (await fetch(`${base}/api/system/status`)).json();
    assert.equal(status.youcam.keyConfigured, true);
    assert.ok(!JSON.stringify(status).includes('test-key'), 'status must never expose the API key');
  } finally {
    server.closeAllConnections?.();
    server.close();
    await mock.close();
  }
});
