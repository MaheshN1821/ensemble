import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/lib/errors.js';
import { createMemoryLedger } from '../src/services/ledger.js';
import { createImporter } from '../src/services/catalog/importer.js';
import { createCatalogService } from '../src/services/catalog/service.js';
import { createMemoryCatalogRepo } from '../src/services/catalog/repoMemory.js';
import { seedFixture } from './fixtures/seedFixture.js';
import { createSkinService } from '../src/services/skin/service.js';
import { createRenderService } from '../src/services/render/service.js';
import { createShareTokens } from '../src/services/render/share.js';
import { photoKey, stageKey } from '../src/services/render/keys.js';
import { buildRequest, foundationEffect, lipTexture } from '../src/services/render/payloads.js';
import { DEFAULT_FEATURES } from '../src/config/render.js';
import { silentLogger, fakeJpeg, fakePng, createMemorySessions, createMemoryStorage } from './helpers.js';

const IDS = { outfit: 'outfit-ivory-kurta', necklace: 'necklace-oxidised-choker', earrings: 'earrings-pearl-drop', lipstick: 'lipstick-classic-red' };
const itemIds = (over = {}) => Object.values({ ...IDS, ...over }).filter(Boolean);

function fakeGateway() {
  const g = { calls: [], fail: new Map(), gate: null, n: 0 };
  g.unitsFor = async () => ({ units: 1, known: true });
  g.deleteTask = async () => true;
  g.runTask = async (args) => {
    g.calls.push(args);
    if (g.gate) await g.gate;
    if (g.fail.get(args.feature) > 0) {
      g.fail.set(args.feature, g.fail.get(args.feature) - 1);
      throw new AppError('TASK_FAILED', 'could not process', 422, { code: 'error_no_face' });
    }
    g.n += 1;
    return { taskId: `t${g.n}`, feature: args.feature, units: 1, unitsFor: 1, unitsKnown: true, stored: [{ publicId: `ensemble/sess-1/out-${g.n}`, width: 100, height: 100 }], results: {}, resultUrls: [] };
  };
  return g;
}

async function boot({ budgetInr = 25000 } = {}) {
  const storage = createMemoryStorage();
  const config = { sessionUnitCap: 50, globalDailyUnitCap: 100, publicClientUrl: 'https://app.test', render: {}, shareSecret: 'test-secret-test-secret' };
  const repo = createMemoryCatalogRepo();
  const catalogs = createCatalogService({ repo, importer: createImporter({ fetcher: {}, storage, logger: silentLogger }), storage, config, logger: silentLogger });
  await seedFixture(repo);
  const sessions = createMemorySessions();
  const d = sessions.docs.get('sess-1');
  d.consent = { over18: true, ownPhotos: false };
  d.preferences = { occasion: 'wedding-guest', occasionText: '', budgetInr, silhouettes: [], metal: 'any', avoidColours: [], notes: '' };
  d.skinProfile = { selfieKey: 'sample:sample-a', source: 'sample', skin: { hex: '#C08A5E', L: 62, a: 14, b: 26, ita: 25, hue: 59, chroma: 30 }, depth: { id: 'tan' }, undertone: { id: 'warm', confidence: 'high' }, override: null };
  d.photos = { selfie: { source: 'sample', sampleId: 'sample-a' }, body: { source: 'sample', sampleId: 'sample-a' } };
  const gateway = fakeGateway();
  const skin = createSkinService({ gateway: {}, storage, sessions, logger: silentLogger });
  const fetchOwn = async (url) => (url.includes('body') ? fakeJpeg(800, 1400) : url.endsWith('.png') ? fakePng(600, 700) : fakeJpeg(900, 900));
  let clock = Date.now();
  const renders = createRenderService({ gateway, storage, sessions, catalogs, skin, ledger: createMemoryLedger(), config, logger: silentLogger, fetchOwn, safeFetcher: {}, now: () => clock });
  const session = () => sessions.get('sess-1');
  const settle = async (id) => {
    for (let i = 0; i < 400; i++) {
      const l = await renders.get(await session(), id);
      if (!l.active) return l;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('look never finished');
  };
  return { renders, gateway, sessions, storage, session, settle, tick: (ms) => { clock += ms; }, config };
}

test('keys: stable, and different for a different photo, item or input', () => {
  const item = { id: 'a', type: 'outfit', imageUrl: 'https://x/a.png', colours: [{ hex: '#112233' }] };
  const base = { feature: 'cloth-v4', stage: 'outfit', item, inputKey: 'h:1' };
  assert.equal(stageKey(base), stageKey({ ...base }));
  assert.notEqual(stageKey(base), stageKey({ ...base, inputKey: 'h:2' }));
  assert.notEqual(stageKey(base), stageKey({ ...base, item: { ...item, id: 'b' } }));
  assert.notEqual(stageKey(base), stageKey({ ...base, item: { ...item, imageUrl: 'https://x/new.png' } }));
  assert.equal(photoKey({ source: 'upload', publicId: 'p', hash: 'abc' }, 'selfie'), 'h:abc');
  assert.equal(photoKey({ source: 'sample', sampleId: 's1' }, 'body'), 'sample:s1:body');
});

test('payloads: outfit, jewellery in each style, lipstick', () => {
  const input = { buffer: Buffer.from('i'), contentType: 'image/jpg', fileName: 'i.jpg' };
  const product = { buffer: Buffer.from('p'), contentType: 'image/png', fileName: 'p.png' };
  const o = buildRequest({ stage: 'outfit', item: { garmentCategory: 'upper_body' }, features: DEFAULT_FEATURES, input, product });
  assert.equal(o.feature, 'cloth-v4');
  assert.deepEqual(o.files.map((f) => f.field), ['src_file_id', 'ref_file_id']);
  assert.equal(o.params.garment_category, 'upper_body');
  assert.equal(buildRequest({ stage: 'outfit', item: {}, features: DEFAULT_FEATURES, input, product }).params.garment_category, 'auto');

  const files = buildRequest({ stage: 'earrings', item: {}, features: DEFAULT_FEATURES, vtoStyle: 'files', input, product });
  assert.equal(files.feature, '2d-vto/earring');
  assert.equal(files.files[1].field, 'ref_file_ids');
  assert.equal(files.files[1].asArray, true);
  const eyewearFeatures = { ...DEFAULT_FEATURES, eyewear: '2d-vto/glasses' };
  assert.equal(buildRequest({ stage: 'eyewear', item: {}, features: eyewearFeatures, input, product }).feature, '2d-vto/glasses');
  const watch = buildRequest({ stage: 'watch', item: {}, features: DEFAULT_FEATURES, input, product });
  assert.equal(watch.feature, '2d-vto/watch');
  assert.deepEqual(watch.params.object_infos[0].parameter, {
    watch_need_remove_background: true,
    watch_wearing_location: 0,
    watch_shadow_intensity: 0.3,
    watch_ambient_light_intensity: 1,
  });
  const info = buildRequest({ stage: 'necklace', item: {}, features: DEFAULT_FEATURES, vtoStyle: 'info', input, product });
  assert.deepEqual(info.files.map((f) => f.field), ['source_info.name', 'object_infos.0.name']);
  const both = buildRequest({ stage: 'necklace', item: {}, features: DEFAULT_FEATURES, vtoStyle: 'both', input, product });
  assert.equal(both.files.length, 2);
  assert.ok(both.files[0].fields.includes('source_info.name'));

  const lip = buildRequest({ stage: 'lipstick', item: { name: 'Rose gloss', colours: [{ hex: '#c2185b' }] }, features: DEFAULT_FEATURES, input });
  assert.equal(lip.feature, 'makeup-vto');
  assert.equal(lip.params.effects[0].category, 'lip_color');
  assert.equal(lip.params.effects[0].palettes[0].color, '#C2185B');
  assert.equal(lip.params.effects[0].palettes[0].texture, 'gloss');
  assert.equal(lipTexture('Classic red').texture, 'matte');
  assert.throws(() => buildRequest({ stage: 'lipstick', item: { name: 'No colour', colours: [] }, features: DEFAULT_FEATURES, input }), /no lipstick colour/);

  const foundation = buildRequest({
    stage: 'foundation',
    item: { colours: ['#D59B6A'] },
    features: DEFAULT_FEATURES,
    input,
  });
  assert.equal(foundation.feature, 'makeup-vto');
  assert.deepEqual(foundation.params, { version: '1.0', effects: [foundationEffect({ colours: ['#D59B6A'] })] });
});

test('a look is drawn in four tasks, then repeating it costs nothing', async () => {
  const t = await boot();
  const first = await t.renders.start(await t.session(), { itemIds: itemIds() });
  assert.equal(first.active, true);
  const done = await t.settle(first.id);
  assert.equal(done.status, 'done');
  assert.equal(t.gateway.calls.length, 4);
  assert.deepEqual(t.gateway.calls.map((c) => c.feature).sort(), ['2d-vto/earring', '2d-vto/necklace', 'cloth-v4', 'makeup-vto']);
  assert.ok(done.images.body && done.images.face);
  assert.equal(done.unitsSpent, 4);
  assert.ok(done.stages.every((s) => s.status === 'done' && !s.cached));

  const again = await t.renders.start(await t.session(), { itemIds: itemIds() });
  const repeated = await t.settle(again.id);
  assert.equal(t.gateway.calls.length, 4, 'no new YouCam tasks');
  assert.equal(repeated.status, 'done');
});

test('changing only the lipstick draws only the lipstick', async () => {
  const t = await boot();
  const a = await t.renders.start(await t.session(), { itemIds: itemIds() });
  await t.settle(a.id);
  const b = await t.renders.start(await t.session(), { itemIds: itemIds({ lipstick: 'lipstick-berry' }) });
  assert.notEqual(a.id, b.id);
  const done = await t.settle(b.id);
  assert.equal(t.gateway.calls.length, 5);
  assert.equal(t.gateway.calls.at(-1).feature, 'makeup-vto');
  assert.equal(done.status, 'done');
  assert.equal(done.unitsSpent, 1, 'only the new lipstick is charged to this look');
  assert.equal(done.stages.find((s) => s.id === 'outfit').cached, true);
});

test('a failed stage keeps the rest, and a retry draws only what is missing', async () => {
  const t = await boot();
  t.gateway.fail.set('2d-vto/earring', 1);
  const look = await t.renders.start(await t.session(), { itemIds: itemIds() });
  const partial = await t.settle(look.id);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.stages.find((s) => s.id === 'earrings').status, 'failed');
  assert.match(partial.stages.find((s) => s.id === 'earrings').error.message, /face/i);
  assert.equal(partial.canRetry, true);
  assert.equal(t.gateway.calls.length, 4); // outfit, earrings (failed), necklace, lipstick

  const retried = await t.renders.startFromId(await t.session(), look.id);
  const done = await t.settle(retried.id);
  assert.equal(done.status, 'done');
  assert.equal(t.gateway.calls.length, 5, 'only the earrings ran again');
  assert.equal(t.gateway.calls.at(-1).feature, '2d-vto/earring');
});

test('one look at a time, and the same look joins the running job', async () => {
  const t = await boot();
  let release;
  t.gateway.gate = new Promise((r) => { release = r; });
  const a = await t.renders.start(await t.session(), { itemIds: itemIds() });
  const same = await t.renders.start(await t.session(), { itemIds: itemIds() });
  assert.equal(same.id, a.id);
  await assert.rejects(t.renders.start(await t.session(), { itemIds: itemIds({ lipstick: 'lipstick-berry' }) }), (e) => e.code === 'RENDER_BUSY');
  release();
  await t.settle(a.id);
});

test('the budget is a hard limit, and bad input gets a plain error', async () => {
  const t = await boot({ budgetInr: 2000 });
  await assert.rejects(t.renders.start(await t.session(), { itemIds: itemIds() }), (e) => e.code === 'OVER_BUDGET');
  await assert.rejects(t.renders.start(await t.session(), { itemIds: [] }), (e) => e.code === 'INVALID_INPUT');
  await assert.rejects(t.renders.start(await t.session(), { itemIds: ['nope'] }), (e) => e.code === 'ITEM_NOT_FOUND');
  await assert.rejects(t.renders.start(await t.session(), { itemIds: [IDS.necklace] }), (e) => e.code === 'INVALID_INPUT');
  assert.equal(t.gateway.calls.length, 0);
});

test('replacing the selfie removes face drawings and keeps the outfit', async () => {
  const t = await boot();
  const a = await t.renders.start(await t.session(), { itemIds: itemIds() });
  await t.settle(a.id);
  await t.renders.dropForPhotos('sess-1', ['selfie']);
  const after = await t.renders.get(await t.session(), a.id);
  assert.equal(after.status, 'partial');
  assert.equal(after.images.face, null);
  assert.ok(after.images.body);
  const b = await t.renders.start(await t.session(), { itemIds: itemIds() });
  await t.settle(b.id);
  assert.equal(t.gateway.calls.length, 7, 'three face stages were drawn again, the outfit was reused');
});

test('share links: signed, expiring, and showing items and images only', async () => {
  const tokens = createShareTokens({ secret: 'a-secret-a-secret', now: () => 1000 });
  const token = tokens.sign({ sessionId: 's', lookId: 'l', expiresAt: 5000 });
  assert.deepEqual(tokens.verify(token), { sessionId: 's', lookId: 'l', expiresAt: 5000 });
  assert.equal(tokens.verify(`${token}x`), null);
  assert.equal(tokens.verify(token.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'))), null);
  assert.equal(createShareTokens({ secret: 'a-secret-a-secret', now: () => 6000 }).verify(token), null);
  assert.equal(createShareTokens({ secret: 'another-secret-xx', now: () => 1000 }).verify(token), null);

  const t = await boot();
  await assert.rejects(t.renders.createShare(await t.session(), 'look_0000000000'), (e) => e.code === 'NOT_FOUND');
  const look = await t.renders.start(await t.session(), { itemIds: itemIds() });
  await t.settle(look.id);
  const { token: shareToken, expiresAt } = await t.renders.createShare(await t.session(), look.id);
  assert.ok(new Date(expiresAt) > new Date());
  const shared = await t.renders.openShare(shareToken);
  assert.equal(shared.items.length, 4);
  assert.equal(shared.reasons, undefined);
  assert.ok(shared.label.startsWith('AI preview'));
  assert.ok((await t.renders.shareImage(shareToken, 'body')).url);
  await assert.rejects(t.renders.openShare('garbage'), (e) => e.code === 'SHARE_EXPIRED');
  t.tick(25 * 3_600_000);
  await assert.rejects(t.renders.openShare(shareToken), (e) => e.code === 'SHARE_EXPIRED');
});
