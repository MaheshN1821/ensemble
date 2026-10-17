import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestQueue } from '../src/lib/requestQueue.js';
import { TokenBucket } from '../src/lib/tokenBucket.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('respects concurrency', async () => {
  const q = new RequestQueue({ concurrency: 2 });
  let active = 0;
  let peak = 0;
  const job = async () => { active++; peak = Math.max(peak, active); await wait(20); active--; };
  await Promise.all(Array.from({ length: 6 }, () => q.schedule(job)));
  assert.equal(peak, 2);
});

test('paces dispatch with a token bucket', async () => {
  const q = new RequestQueue({ concurrency: 5, buckets: [new TokenBucket({ capacity: 1, refillPerSec: 20 })] });
  const started = Date.now();
  await Promise.all(Array.from({ length: 5 }, () => q.schedule(async () => {})));
  // 1 immediate + 4 refills at 50 ms each
  assert.ok(Date.now() - started >= 180, `finished in ${Date.now() - started} ms`);
});

test('higher priority jobs run first', async () => {
  const q = new RequestQueue({ concurrency: 1 });
  const order = [];
  const blocker = q.schedule(() => wait(30));
  const low = q.schedule(async () => order.push('low'), { priority: 0 });
  const high = q.schedule(async () => order.push('high'), { priority: 1 });
  await Promise.all([blocker, low, high]);
  assert.deepEqual(order, ['high', 'low']);
});

test('penalize pauses dispatching', async () => {
  const q = new RequestQueue({ concurrency: 1 });
  q.penalize(80);
  const started = Date.now();
  await q.schedule(async () => {});
  assert.ok(Date.now() - started >= 70);
});

test('propagates errors without wedging the queue', async () => {
  const q = new RequestQueue({ concurrency: 1 });
  await assert.rejects(q.schedule(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await q.schedule(async () => 'ok'), 'ok');
});
