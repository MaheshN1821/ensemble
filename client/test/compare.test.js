import test from 'node:test';
import assert from 'node:assert/strict';
import { compareLooks, pairFromParams, toggleSelection } from '../src/lib/compare.js';

const item = (id, price = 100) => ({ id, name: id, price });
const A = { items: { outfit: item('o1'), earrings: item('e1'), lipstick: item('l1') }, totalPrice: 5000, score: 80, reasons: ['r1', 'shared'] };
const B = { items: { outfit: item('o2'), earrings: item('e1'), eyewear: item('ew1'), lipstick: item('l1') }, totalPrice: 6500, score: 74, reasons: ['shared', 'r2'] };

test('compare: rows say what is shared and what differs', () => {
  const c = compareLooks(A, B);
  assert.deepEqual(c.rows.map((r) => [r.slot, r.same, r.onlyIn]), [['outfit', false, null], ['earrings', true, null], ['lipstick', true, null], ['eyewear', false, 'b'], ['watch', true, null]]);
  assert.equal(c.differing, 2);
  assert.equal(c.priceDiff, 1500);
  assert.equal(c.scoreDiff, -6);
  assert.deepEqual(c.reasons, { shared: ['shared'], onlyA: ['r1'], onlyB: ['r2'] });
  assert.match(c.summary, /2 items differ\. Look B costs ₹1,500 more, and its match score is 6 points lower\./);
});

test('compare: identical looks and equal totals read plainly', () => {
  const c = compareLooks(A, A);
  assert.equal(c.differing, 0);
  assert.equal(c.summary, 'These two looks use the same items.');
  const d = compareLooks(A, { ...B, totalPrice: 5000, score: 80 });
  assert.match(d.summary, /The total is the same, and the match score is the same\./);
});

test('selection holds at most two, newest last', () => {
  let s = [];
  s = toggleSelection(s, 'a');
  s = toggleSelection(s, 'b');
  assert.deepEqual(s, ['a', 'b']);
  s = toggleSelection(s, 'c');
  assert.deepEqual(s, ['b', 'c']);
  assert.deepEqual(toggleSelection(s, 'b'), ['c']);
});

test('query params: only real look ids, and the two must differ', () => {
  const p = (q) => pairFromParams(new URLSearchParams(q));
  assert.deepEqual(p('a=look_0123456789&b=look_abcdef0123'), { a: 'look_0123456789', b: 'look_abcdef0123' });
  assert.deepEqual(p('a=look_0123456789&b=look_0123456789'), { a: 'look_0123456789', b: null });
  assert.deepEqual(p('a=<script>&b=nope'), { a: null, b: null });
});
