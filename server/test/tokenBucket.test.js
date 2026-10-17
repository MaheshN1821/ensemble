import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucket, boundedBucket } from '../src/lib/tokenBucket.js';

test('refills over time and never exceeds capacity', () => {
  let t = 0;
  const b = new TokenBucket({ capacity: 3, refillPerSec: 1, now: () => t });
  assert.equal(b.take(3), true);
  assert.equal(b.take(1), false);
  assert.equal(b.msUntil(1), 1000);
  t += 2500;
  assert.equal(Math.floor(b.available()), 2);
  t += 60_000;
  assert.equal(b.available(), 3);
});

test('boundedBucket never allows more than `limit` in any window', () => {
  let t = 0;
  const b = boundedBucket({ name: 'w', limit: 230, windowSeconds: 300, now: () => t });
  let taken = 0;
  // Hammer the bucket every 100 ms for exactly one window.
  for (; t <= 300_000; t += 100) while (b.take(1)) taken += 1;
  assert.ok(taken <= 230, `took ${taken}`);
  assert.ok(taken >= 225, `took ${taken}`);
});
