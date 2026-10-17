import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { AppError } from '../src/lib/errors.js';
import { RequestQueue } from '../src/lib/requestQueue.js';
import { createMemoryLedger } from '../src/services/ledger.js';
import { classifySkin, classifyUndertone, hexToLab, ita, classifyDepth, undertoneFromLabel } from '../src/services/skin/classify.js';
import { extractSkinSignals } from '../src/services/skin/extract.js';
import { buildPalette } from '../src/services/skin/profile.js';
import { COLOUR_FAMILIES, LIPSTICKS, PALETTES } from '../src/config/skin.js';
import { silentLogger, fakeJpeg, createMemorySessions, createMemoryStorage } from './helpers.js';

// ---------- pure rules ----------

test('colour maths: white, black and a mid skin tone', () => {
  const white = hexToLab('#FFFFFF');
  assert.ok(Math.abs(white.L - 100) < 0.1 && Math.abs(white.a) < 0.1);
  assert.ok(hexToLab('#000000').L < 0.1);
  const skin = hexToLab('#B98A6C');
  assert.ok(skin.L > 50 && skin.L < 65, `L* ${skin.L}`);
  assert.ok(skin.a > 8 && skin.b > 15, 'skin is red-yellow in Lab');
  assert.throws(() => hexToLab('nope'));
});

test('depth gets lighter as the colour gets lighter, across the whole range', () => {
  const order = ['very-light', 'light', 'medium', 'tan', 'deep', 'very-deep'];
  // Colours chosen to fall in each published ITA class (>55, 41-55, 28-41, 10-28, -30-10, below -30)
  const hexes = ['#F1D5C3', '#E0B99C', '#C99A7A', '#B98A6C', '#8A6048', '#3E271C'];
  const ids = hexes.map((h) => classifyDepth(ita(hexToLab(h))).id);
  assert.deepEqual(ids, order);
});

test('undertone rules: cool, neutral, warm, olive, and confidence near a boundary', () => {
  const lab = (hueDeg, chroma) => ({ a: chroma * Math.cos((hueDeg * Math.PI) / 180), b: chroma * Math.sin((hueDeg * Math.PI) / 180) });
  assert.equal(classifyUndertone(lab(44, 28)).id, 'cool');
  assert.equal(classifyUndertone(lab(55, 28)).id, 'neutral');
  assert.equal(classifyUndertone(lab(66, 30)).id, 'warm');
  assert.equal(classifyUndertone({ L: 60, ...lab(66, 19) }).id, 'olive');
  assert.notEqual(classifyUndertone({ L: 87, ...lab(61, 14) }).id, 'olive', 'very pale skin is not olive just because chroma is low');
  assert.equal(classifyUndertone(lab(44, 28)).confidence, 'high'); // 8 degrees from the boundary
  assert.equal(classifyUndertone(lab(52.5, 28)).confidence, 'low'); // half a degree from cool/neutral
  assert.equal(classifyUndertone(lab(59, 30)).confidence, 'low'); // one degree from neutral/warm
});

test('an undertone label from the API wins, and disagreeing with our rules lowers confidence', () => {
  assert.equal(undertoneFromLabel('Warm undertone'), 'warm');
  assert.equal(undertoneFromLabel('lukewarm'), null);
  const base = classifySkin({ hex: '#B98A6C' });
  const same = classifySkin({ hex: '#B98A6C', apiUndertone: base.undertone.id });
  assert.deepEqual([same.undertone.source, same.undertone.confidence], ['api', 'high']);
  const other = classifySkin({ hex: '#B98A6C', apiUndertone: base.undertone.id === 'cool' ? 'warm' : 'cool' });
  assert.deepEqual([other.undertone.source, other.undertone.confidence], ['api', 'low']);
});

test('extractor: finds the skin colour in several plausible result shapes', () => {
  assert.equal(extractSkinSignals({ skin_tone: { hex: '#b98a6c' } }).hex, '#B98A6C');
  assert.equal(extractSkinSignals({ data: [{ skin_color: [185, 138, 108] }] }).hex, '#B98A6C');
  assert.equal(extractSkinSignals({ result: { skin: { rgb: { r: 185, g: 138, b: 108 } } } }).hex, '#B98A6C');
  assert.equal(extractSkinSignals({ skin_tone: { hex: '#B98A6C', undertone: 'Cool' } }).apiUndertone, 'cool');
  // Lips, hair and image URLs are never mistaken for skin; the skin colour still wins
  const mixed = extractSkinSignals({ lip_color: '#C2306A', hair: { color: '#111111' }, skin: { color: '#B98A6C' }, url: 'https://x/y.jpg' });
  assert.equal(mixed.hex, '#B98A6C');
  assert.equal(extractSkinSignals({ lip_color: '#C2306A', image: 'https://x/y.jpg' }), null);
  assert.equal(extractSkinSignals(null), null);
});

test('palette: every family exists, avoided colours are left out, pale tones move down for light skin, lipstick follows depth', () => {
  for (const p of Object.values(PALETTES)) for (const id of [...p.best, ...p.careful]) assert.ok(COLOUR_FAMILIES[id], id);
  for (const shades of Object.values(LIPSTICKS)) for (const s of shades) assert.match(s.hex.deep, /^#[0-9A-F]{6}$/i);

  const plain = buildPalette({ undertone: 'warm', depth: 'tan' });
  assert.ok(plain.best.some((c) => c.id === 'champagne'));
  const light = buildPalette({ undertone: 'warm', depth: 'light' });
  assert.ok(!light.best.some((c) => c.id === 'champagne') && light.careful.some((c) => c.id === 'champagne'));

  const noOrange = buildPalette({ undertone: 'warm', depth: 'tan' }, { avoidColours: ['orange'] });
  assert.ok(!noOrange.best.some((c) => ['coral', 'peach', 'saffron'].includes(c.id)));
  assert.deepEqual(noOrange.skippedForYou, ['Orange']);

  assert.notEqual(buildPalette({ undertone: 'cool', depth: 'light' }).lips[0].hex, buildPalette({ undertone: 'cool', depth: 'deep' }).lips[0].hex);
  assert.equal(buildPalette({ undertone: 'cool', depth: 'tan' }).metals.primary, 'silver');
  assert.match(buildPalette({ undertone: 'cool', depth: 'tan' }, { metal: 'gold' }).metals.note, /You asked for gold/);
});

// ---------- HTTP flow ----------

function fakeGateway({ results, fail, delayMs = 0 } = {}) {
  const gw = {
    calls: 0,
    async runTask(args) {
      gw.calls += 1;
      gw.last = args;
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (fail) throw fail;
      return { taskId: 'task-1', units: 3, unitsKnown: true, results: results ?? { skin_tone: { hex: '#B98A6C' } } };
    },
  };
  return gw;
}

async function boot({ gateway = fakeGateway(), storageOpts } = {}) {
  const sessions = createMemorySessions();
  const storage = createMemoryStorage(storageOpts);
  const config = { clientOrigins: [], enableDevRoutes: false, sessionUnitCap: 50, globalDailyUnitCap: 100 };
  const app = createApp({ config, logger: silentLogger, gateway, ledger: createMemoryLedger(), queue: new RequestQueue({ concurrency: 1 }), sessions, storage, dbState: () => 'connected' });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const H = { 'x-session-id': 'sess-1' };
  const call = (path, method = 'GET', body) =>
    fetch(`${base}${path}`, { method, headers: { ...H, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const photo = (kind, buf) => {
    const f = new FormData();
    f.append('image', new Blob([buf], { type: 'image/jpeg' }), 'p.jpg');
    return fetch(`${base}/api/sessions/me/photos/${kind}`, { method: 'PUT', headers: H, body: f });
  };
  const close = () => { server.closeAllConnections?.(); server.close(); };
  return { call, photo, gateway, sessions, storage, close };
}

const consent = (t, ownPhotos = true) => t.call('/api/sessions/me/consent', 'POST', { over18: true, ownPhotos });
const SKIN = '/api/sessions/me/skin-profile';

test('skin: needs consent and a selfie before anything is spent', async () => {
  const t = await boot();
  try {
    assert.equal((await t.call(SKIN, 'POST')).status, 403);
    await consent(t);
    const r = await t.call(SKIN, 'POST');
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error.code, 'PHOTOS_REQUIRED');
    assert.equal(t.gateway.calls, 0);
    assert.equal((await (await t.call(SKIN)).json()).profile, null);
  } finally { t.close(); }
});

test('skin: reads an uploaded selfie once, then serves the cache; a new selfie triggers a new reading', async () => {
  const t = await boot();
  try {
    await consent(t);
    await t.photo('selfie', fakeJpeg(1000, 1200));

    const first = await (await t.call(SKIN, 'POST')).json();
    assert.equal(t.gateway.calls, 1);
    assert.equal(t.gateway.last.feature, 'skin-tone-analysis');
    assert.equal(t.gateway.last.files[0].field, 'src_file_id');
    assert.equal(first.profile.cached, false);
    assert.equal(first.profile.source, 'youcam');
    assert.equal(first.profile.skin.hex, '#B98A6C');
    assert.equal(first.profile.units, 3);
    assert.ok(first.profile.palette.best.length > 0 && first.profile.palette.lips.length === 3);
    assert.ok(first.options.undertones.length === 4);

    const again = await (await t.call(SKIN, 'POST')).json();
    assert.equal(again.profile.cached, true);
    assert.equal(t.gateway.calls, 1, 'second request must not spend units');
    assert.equal((await (await t.call(SKIN)).json()).profile.skin.hex, '#B98A6C');

    // Replacing the selfie drops the old reading, and the next POST reads again
    await t.photo('selfie', fakeJpeg(1100, 1300));
    assert.equal((await (await t.call(SKIN)).json()).profile, null);
    await t.call(SKIN, 'POST');
    assert.equal(t.gateway.calls, 2);
  } finally { t.close(); }
});

test('skin: two simultaneous requests share one YouCam task', async () => {
  const t = await boot({ gateway: fakeGateway({ delayMs: 60 }) });
  try {
    await consent(t);
    await t.photo('selfie', fakeJpeg(1000, 1200));
    const [a, b] = await Promise.all([t.call(SKIN, 'POST'), t.call(SKIN, 'POST')]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    assert.equal(t.gateway.calls, 1);
  } finally { t.close(); }
});

test('skin: sample models are read locally and send nothing to YouCam', async () => {
  const t = await boot({ storageOpts: { configured: false } });
  try {
    await consent(t, false);
    await t.call('/api/sessions/me/sample-model', 'PUT', { modelId: 'sample-b' });
    const r = await (await t.call(SKIN, 'POST')).json();
    assert.equal(t.gateway.calls, 0);
    assert.equal(r.profile.source, 'sample');
    assert.equal(r.profile.units, 0);
    assert.equal(r.profile.skin.hex, '#8A6048');
    // Switching sample model invalidates the reading
    await t.call('/api/sessions/me/sample-model', 'PUT', { modelId: 'sample-a' });
    assert.equal((await (await t.call(SKIN)).json()).profile, null);
  } finally { t.close(); }
});

test('skin: override is partial, reversible, and does not change what was detected', async () => {
  const t = await boot();
  try {
    await consent(t);
    await t.photo('selfie', fakeJpeg(1000, 1200));
    const base = (await (await t.call(SKIN, 'POST')).json()).profile;
    const otherUndertone = base.undertone.id === 'cool' ? 'warm' : 'cool';

    let p = (await (await t.call(`${SKIN}/override`, 'PUT', { undertone: otherUndertone })).json()).profile;
    assert.equal(p.undertone.id, otherUndertone);
    assert.equal(p.undertone.detected, base.undertone.id);
    assert.equal(p.overridden, true);

    p = (await (await t.call(`${SKIN}/override`, 'PUT', { depth: 'deep' })).json()).profile;
    assert.equal(p.undertone.id, otherUndertone, 'sending depth must not clear the undertone override');
    assert.equal(p.depth.id, 'deep');

    // Choosing the detected value again is not an override
    p = (await (await t.call(`${SKIN}/override`, 'PUT', { undertone: base.undertone.id, depth: base.depth.id })).json()).profile;
    assert.equal(p.overridden, false);

    await t.call(`${SKIN}/override`, 'PUT', { undertone: otherUndertone });
    p = (await (await t.call(`${SKIN}/override`, 'DELETE')).json()).profile;
    assert.equal(p.undertone.id, base.undertone.id);

    assert.equal((await t.call(`${SKIN}/override`, 'PUT', { undertone: 'purple' })).status, 400);
    assert.equal((await t.call(`${SKIN}/override`, 'PUT', {})).status, 400);
  } finally { t.close(); }
});

test('skin: a failed task gives a clear, actionable error and spends nothing extra', async () => {
  const noFace = new AppError('TASK_FAILED', 'YouCam could not process this image.', 422, { code: 'error_no_face' });
  const t = await boot({ gateway: fakeGateway({ fail: noFace }) });
  try {
    await consent(t);
    await t.photo('selfie', fakeJpeg(1000, 1200));
    const r = await t.call(SKIN, 'POST');
    assert.equal(r.status, 422);
    const e = (await r.json()).error;
    assert.equal(e.code, 'SELFIE_UNUSABLE');
    assert.match(e.message, /clear face/);
    assert.equal((await (await t.call(SKIN)).json()).profile, null, 'nothing is cached after a failure');
  } finally { t.close(); }
});

test('skin: an unreadable result reports its shape (keys only) so the parser can be pinned', async () => {
  const t = await boot({ gateway: fakeGateway({ results: { analysis: { category: 'medium', score: 0.8 } } }) });
  try {
    await consent(t);
    await t.photo('selfie', fakeJpeg(1000, 1200));
    const r = await t.call(SKIN, 'POST');
    assert.equal(r.status, 502);
    const e = (await r.json()).error;
    assert.equal(e.code, 'SKIN_NOT_READ');
    assert.deepEqual(e.details.shape, { analysis: { category: 'string', score: 'number' } });
  } finally { t.close(); }
});
