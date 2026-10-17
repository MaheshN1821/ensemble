import test from 'node:test';
import assert from 'node:assert/strict';
import { createYoucamClient } from '../src/services/youcam/client.js';
import { createGateway } from '../src/services/youcam/gateway.js';
import { createMemoryLedger } from '../src/services/ledger.js';
import { RequestQueue } from '../src/lib/requestQueue.js';
import { startMockYoucam, silentLogger } from './helpers.js';

async function setup(mockOpts = {}, configOverrides = {}) {
  const mock = await startMockYoucam(mockOpts);
  const ledger = createMemoryLedger();
  const queue = new RequestQueue({ concurrency: 3 });
  const savedUrls = [];
  const storage = {
    isConfigured: () => true,
    saveFromUrl: async ({ url }) => { savedUrls.push(url); return { publicId: 'ensemble/s/abc' }; },
  };
  const gateway = createGateway({
    client: createYoucamClient({ apiKey: 'test-key', baseUrl: mock.baseUrl }),
    queue, ledger, storage, logger: silentLogger,
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))), // keep tests fast
    config: { unitOverrides: {}, unknownFeatureUnits: 5, sessionUnitCap: 10, globalDailyUnitCap: 100, pollIntervalMs: 1000, taskTimeoutMs: 5000, ...configOverrides },
  });
  return { mock, ledger, gateway, savedUrls };
}

const file = { field: 'src_file_id', buffer: Buffer.from('abc'), fileName: 'selfie.jpg', contentType: 'image/jpg' };

test('runs upload -> task -> poll and records the units in the ledger', async () => {
  const { mock, ledger, gateway } = await setup();
  try {
    const r = await gateway.runTask({ sessionId: 's1', feature: 'skin-tone-analysis', files: [file] });
    assert.equal(r.taskId, 'task-1');
    assert.equal(r.units, 3); // resolved from the feature-cost response
    assert.equal(r.unitsKnown, true);
    assert.equal(r.results.skin.color, '#c58c6b');
    assert.equal(mock.state.lastCreatePayload.src_file_id, 'file-1');
    assert.equal(mock.state.taskPolls, 3);
    const task = ledger.rows.find((x) => x.kind === 'task');
    assert.deepEqual([task.success, task.units, task.sessionId], [true, 3, 's1']);
    assert.equal(await ledger.sessionUnits('s1'), 3);
  } finally { await mock.close(); }
});

test('retries task creation on 429 without double charging', async () => {
  const { mock, ledger, gateway } = await setup({ createFails429Times: 2 });
  try {
    const r = await gateway.runTask({ sessionId: 's1', feature: 'skin-tone-analysis', files: [file] });
    assert.equal(r.units, 3);
    assert.equal(mock.state.createAttempts, 3);
    assert.equal(ledger.rows.filter((x) => x.kind === 'task').length, 1);
  } finally { await mock.close(); }
});

test('a failed task is logged with 0 units', async () => {
  const { mock, ledger, gateway } = await setup({ taskError: true });
  try {
    await assert.rejects(gateway.runTask({ sessionId: 's1', feature: 'skin-tone-analysis', files: [file] }), (e) => e.code === 'TASK_FAILED');
    const task = ledger.rows.find((x) => x.kind === 'task');
    assert.deepEqual([task.success, task.units, task.errorCode], [false, 0, 'TASK_FAILED']);
    assert.equal(await ledger.sessionUnits('s1'), 0);
  } finally { await mock.close(); }
});

test('stops cleanly at the session cap before calling YouCam', async () => {
  const { mock, ledger, gateway } = await setup({}, { sessionUnitCap: 5 });
  try {
    await gateway.runTask({ sessionId: 's1', feature: 'skin-tone-analysis', files: [file] }); // 3 units
    const createsBefore = mock.state.createAttempts;
    await assert.rejects(gateway.runTask({ sessionId: 's1', feature: 'skin-tone-analysis', files: [file] }), (e) => e.code === 'SESSION_CAP');
    assert.equal(mock.state.createAttempts, createsBefore);
    assert.equal(await ledger.sessionUnits('s1'), 3);
  } finally { await mock.close(); }
});

test('uses a conservative default when the price cannot be resolved, and flags it', async () => {
  const { mock, gateway } = await setup({ costBody: { data: [] } });
  try {
    const r = await gateway.runTask({ sessionId: 's2', feature: 'skin-tone-analysis', files: [file] });
    assert.deepEqual([r.units, r.unitsKnown], [5, false]);
  } finally { await mock.close(); }
});

test('copies result images to storage when asked', async () => {
  const { mock, gateway, savedUrls } = await setup();
  try {
    const r = await gateway.runTask({ sessionId: 's1', feature: 'skin-tone-analysis', files: [file], storeResult: true });
    assert.equal(r.stored.length, 1);
    assert.match(savedUrls[0], /result\.jpg$/);
  } finally { await mock.close(); }
});

test('feature-cost is cached and only recorded once', async () => {
  const { mock, ledger, gateway } = await setup();
  try {
    const a = await gateway.featureCost({});
    const b = await gateway.featureCost({});
    assert.deepEqual([a.cached, b.cached], [false, true]);
    assert.equal(ledger.rows.filter((x) => x.kind === 'feature-cost').length, 1);
  } finally { await mock.close(); }
});
