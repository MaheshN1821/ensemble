import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { readImageInfo } from '../src/lib/imageInfo.js';
import { RequestQueue } from '../src/lib/requestQueue.js';
import { createMemoryLedger } from '../src/services/ledger.js';
import { silentLogger, fakeJpeg, fakePng, createMemorySessions, createMemoryStorage } from './helpers.js';

test('image reader: JPEG, PNG, EXIF rotation, and rejects other files', () => {
  assert.deepEqual(readImageInfo(fakeJpeg(1200, 1800)), { format: 'jpeg', contentType: 'image/jpeg', width: 1200, height: 1800 });
  assert.equal(readImageInfo(fakePng(800, 900)).width, 800);
  // Stored landscape but rotated to portrait by EXIF orientation 6
  const rotated = readImageInfo(fakeJpeg(1800, 1200, { orientation: 6 }));
  assert.equal(rotated.width, 1200);
  assert.equal(rotated.height, 1800);
  assert.equal(readImageInfo(Buffer.from('this is plainly a text file, not an image at all')), null);
  assert.equal(readImageInfo(Buffer.alloc(3)), null);
});

async function boot(storageOpts) {
  const sessions = createMemorySessions();
  const storage = createMemoryStorage(storageOpts);
  const config = { clientOrigins: [], enableDevRoutes: false, sessionUnitCap: 50, globalDailyUnitCap: 100 };
  const app = createApp({ config, logger: silentLogger, gateway: {}, ledger: createMemoryLedger(), queue: new RequestQueue({ concurrency: 1 }), sessions, storage, dbState: () => 'connected' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { 'x-session-id': 'sess-1' };
  const json = (path, method, body) =>
    fetch(`${base}${path}`, { method, headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const photo = (kind, buf, type = 'image/jpeg') => {
    const f = new FormData();
    f.append('image', new Blob([buf], { type }), 'p.jpg');
    return fetch(`${base}/api/sessions/me/photos/${kind}`, { method: 'PUT', headers: H, body: f });
  };
  const close = () => { server.closeAllConnections?.(); server.close(); };
  return { base, H, json, photo, sessions, storage, close };
}

const prefs = { occasion: 'wedding-guest', budgetInr: 25000, silhouettes: ['saree'], metal: 'gold', avoidColours: ['black'], notes: 'Not too heavy' };

test('intake: full flow with uploads, then delete everything', async () => {
  const t = await boot();
  try {
    assert.equal((await (await fetch(`${t.base}/api/intake/config`)).json()).budget.min, 2000);

    // Photos need consent first
    assert.equal((await t.photo('selfie', fakeJpeg(1000, 1000))).status, 403);
    // 18+ is required
    const no = await t.json('/api/sessions/me/consent', 'POST', { over18: false, ownPhotos: true });
    assert.equal(no.status, 400);
    assert.equal((await no.json()).error.code, 'INVALID_INPUT');
    assert.equal((await t.json('/api/sessions/me/consent', 'POST', { over18: true, ownPhotos: true })).status, 200);

    const ok = await t.photo('selfie', fakeJpeg(1000, 1200));
    assert.equal(ok.status, 200);
    const afterSelfie = await ok.json();
    assert.match(afterSelfie.photos.selfie.url, /^https:\/\/cdn\.test\//);
    assert.equal(afterSelfie.complete, false);

    // Too small, wrong type, landscape body
    assert.equal((await (await t.photo('selfie', fakeJpeg(200, 200))).json()).error.code, 'PHOTO_TOO_SMALL');
    assert.equal((await (await t.photo('selfie', Buffer.from('not an image at all, just words'))).json()).error.code, 'BAD_FILE_TYPE');
    assert.equal((await (await t.photo('body', fakeJpeg(1600, 1000))).json()).error.code, 'PHOTO_NOT_PORTRAIT');
    assert.equal((await t.photo('hands', fakeJpeg(1000, 1000))).status, 404);

    // Replacing a photo removes the old one from storage
    const before = [...t.storage.assets.keys()];
    await t.photo('selfie', fakeJpeg(1100, 1300));
    assert.equal(t.storage.assets.size, 1);
    assert.ok(!t.storage.assets.has(before[0]));

    assert.equal((await t.photo('body', fakeJpeg(900, 1600))).status, 200);

    // Preferences validation
    assert.equal((await t.json('/api/sessions/me/preferences', 'PUT', { ...prefs, budgetInr: 10 })).status, 400);
    const other = await t.json('/api/sessions/me/preferences', 'PUT', { ...prefs, occasion: 'other', occasionText: '' });
    assert.equal((await other.json()).error.details.field, 'occasionText');
    const saved = await t.json('/api/sessions/me/preferences', 'PUT', prefs);
    assert.equal(saved.status, 200);
    const state = await (await fetch(`${t.base}/api/sessions/me`, { headers: t.H })).json();
    assert.equal(state.complete, true);
    assert.equal(state.preferences.notes, 'Not too heavy');

    // Delete everything
    const del = await fetch(`${t.base}/api/sessions/me`, { method: 'DELETE', headers: t.H });
    assert.equal(del.status, 200);
    assert.equal((await del.json()).photosDeleted, 2);
    assert.equal(t.storage.assets.size, 0);
    assert.equal((await fetch(`${t.base}/api/sessions/me`, { headers: t.H })).status, 401);
  } finally {
    t.close();
  }
});

test('intake: sample model path needs no storage, and never mixes with real photos', async () => {
  const t = await boot({ configured: false });
  try {
    await t.json('/api/sessions/me/consent', 'POST', { over18: true, ownPhotos: false });
    // Own-photo upload is refused when the person did not confirm they are theirs
    assert.equal((await t.photo('selfie', fakeJpeg(1000, 1000))).status, 403);
    assert.equal((await t.json('/api/sessions/me/sample-model', 'PUT', { modelId: 'nope' })).status, 400);
    const res = await (await t.json('/api/sessions/me/sample-model', 'PUT', { modelId: 'sample-a' })).json();
    assert.equal(res.photos.selfie.url, '/samples/sample-a/selfie.jpg');
    assert.equal(res.photos.body.url, '/samples/sample-a/body.jpg');
    await t.json('/api/sessions/me/preferences', 'PUT', prefs);
    assert.equal((await (await fetch(`${t.base}/api/sessions/me`, { headers: t.H })).json()).complete, true);
  } finally {
    t.close();
  }
});

test('intake: uploading a real photo drops a sample photo from the other slot', async () => {
  const t = await boot();
  try {
    await t.json('/api/sessions/me/consent', 'POST', { over18: true, ownPhotos: true });
    await t.json('/api/sessions/me/sample-model', 'PUT', { modelId: 'sample-b' });
    const res = await (await t.photo('selfie', fakeJpeg(1000, 1200))).json();
    assert.equal(res.photos.selfie.source, 'upload');
    assert.equal(res.photos.body, null);
  } finally {
    t.close();
  }
});

test('intake: storage not configured gives a clear error', async () => {
  const t = await boot({ configured: false });
  try {
    await t.json('/api/sessions/me/consent', 'POST', { over18: true, ownPhotos: true });
    const r = await t.photo('selfie', fakeJpeg(1000, 1000));
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error.code, 'STORAGE_NOT_CONFIGURED');
  } finally {
    t.close();
  }
});
