import test from 'node:test';
import assert from 'node:assert/strict';
import { findUnits, parseTask } from '../src/services/youcam/parse.js';

test('findUnits handles row arrays and key/value maps, and returns null when unknown', () => {
  assert.equal(findUnits({ data: [{ name: 'AI Skin Tone Analysis', unit: 3 }] }, 'skin-tone-analysis'), 3);
  assert.equal(findUnits({ 'skin-tone-analysis': 2, cloth: 7 }, 'skin-tone-analysis'), 2);
  assert.equal(findUnits({ features: [{ title: 'AI Clothes', credits: 5 }] }, 'cloth'), 5);
  assert.equal(findUnits({ data: [] }, 'makeup-vto'), null);
});

test('parseTask normalises status, polling interval and result urls', () => {
  const t = parseTask({ task_status: 'SUCCESS', polling_interval: 2, results: { url: 'https://x/y.jpg', meta: { n: 1 } } });
  assert.equal(t.status, 'success');
  assert.equal(t.pollingIntervalMs, 2000);
  assert.deepEqual(t.resultUrls, ['https://x/y.jpg']);
  assert.equal(parseTask({ task_status: 'running', polling_interval: 4000 }).pollingIntervalMs, 4000);
  assert.equal(parseTask({ task_status: 'error', error: 'error_no_face' }).errorCode, 'error_no_face');
});
