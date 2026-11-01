import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPicks, idsFromSearch, maxUnits, pickedIds, removePick, togglePick, totalOf, totalWith } from '../src/lib/build.js';

const items = [
  { id: 'o1', type: 'outfit', price: 5000 }, { id: 'o2', type: 'outfit', price: 7000 },
  { id: 'e1', type: 'earrings', price: 2000 }, { id: 'l1', type: 'lipstick', price: 500 },
];
const byId = new Map(items.map((i) => [i.id, i]));

test('build: choosing replaces within a kind, and choosing again removes', () => {
  let p = togglePick({}, items[0]);
  p = togglePick(p, items[2]);
  assert.deepEqual(pickedIds(p), ['o1', 'e1']);
  p = togglePick(p, items[1]);
  assert.deepEqual(pickedIds(p), ['o2', 'e1']);
  p = togglePick(p, items[1]);
  assert.deepEqual(pickedIds(p), ['e1']);
});

test('build: totals, and what a swap would cost', () => {
  const p = { outfit: 'o1', lipstick: 'l1' };
  assert.equal(totalOf(p, byId), 5500);
  assert.equal(totalWith(p, items[1], byId), 7500);
  assert.equal(totalWith(p, items[2], byId), 7500);
});

test('build: unknown ids and a second item of one kind are dropped', () => {
  assert.deepEqual(cleanPicks(['o1', 'o2', 'gone', 'l1'], items), { outfit: 'o1', lipstick: 'l1' });
  assert.deepEqual(cleanPicks(undefined, items), {});
});

test('build: ids come from the address, capped at five', () => {
  assert.deepEqual(idsFromSearch('?items=a,b, c,,d,e'), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(idsFromSearch(''), []);
});

test('build: unit estimate counts only the kinds picked', () => {
  const cfg = { stages: [{ id: 'outfit', units: 2 }, { id: 'earrings', units: 1 }, { id: 'lipstick', units: 1 }] };
  assert.equal(maxUnits(cfg, { outfit: 'o1', lipstick: 'l1' }), 3);
  assert.equal(maxUnits(null, {}), null);
});

test('build: removePick removes a slot', () => {
  const p = { outfit: 'o1', earrings: 'e1' };
  assert.deepEqual(removePick(p, 'earrings'), { outfit: 'o1' });
  assert.deepEqual(removePick(p, 'outfit'), { earrings: 'e1' });
});
