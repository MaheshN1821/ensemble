import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/lib/errors.js';
import { createMemoryLedger } from '../src/services/ledger.js';
import { createImporter } from '../src/services/catalog/importer.js';
import { createCatalogService } from '../src/services/catalog/service.js';
import { createMemoryCatalogRepo } from '../src/services/catalog/repoMemory.js';
import { createSkinService } from '../src/services/skin/service.js';
import { createRenderService } from '../src/services/render/service.js';
import { createPlannerService } from '../src/services/planner/service.js';
import { createAgentService, parseTurnBody } from '../src/services/agent/service.js';
import { createLlm, checkReply, LlmError } from '../src/services/agent/llm.js';
import { createTraceStore } from '../src/services/agent/trace.js';
import { readRequest, parseMoney, opsForChip } from '../src/services/agent/rules.js';
import { validateOps } from '../src/services/agent/intent.js';
import { CHIPS } from '../src/config/agent.js';
import { silentLogger, fakeJpeg, fakePng, createMemorySessions, createMemoryStorage } from './helpers.js';

const IDS = { outfit: 'outfit-ivory-kurta', necklace: 'necklace-oxidised-choker', earrings: 'earrings-pearl-drop', lipstick: 'lipstick-classic-red' };
const itemIds = (over = {}) => Object.values({ ...IDS, ...over }).filter(Boolean);

function fakeGateway() {
  const g = { calls: [], n: 0, gate: null };
  g.unitsFor = async () => ({ units: 1, known: true });
  g.deleteTask = async () => true;
  g.runTask = async (args) => {
    g.calls.push(args);
    if (g.gate) await g.gate;
    g.n += 1;
    return { taskId: `t${g.n}`, feature: args.feature, units: 1, unitsKnown: true, stored: [{ publicId: `ensemble/sess-1/out-${g.n}`, width: 100, height: 100 }], results: {}, resultUrls: [] };
  };
  return g;
}

async function boot({ agentConfig = {}, llm = null, budgetInr = 25000 } = {}) {
  const storage = createMemoryStorage();
  const config = { sessionUnitCap: 50, globalDailyUnitCap: 100, publicClientUrl: 'https://app.test', render: {}, shareSecret: 'test-secret-test-secret', agent: agentConfig };
  const catalogs = createCatalogService({ repo: createMemoryCatalogRepo(), importer: createImporter({ fetcher: {}, storage, logger: silentLogger }), storage, config, logger: silentLogger });
  await catalogs.ensureSample();
  const sessions = createMemorySessions();
  const d = sessions.docs.get('sess-1');
  d.consent = { over18: true, ownPhotos: false };
  d.preferences = { occasion: 'wedding-guest', occasionText: '', budgetInr, silhouettes: [], metal: 'any', avoidColours: [], notes: '' };
  d.skinProfile = { selfieKey: 'sample:sample-a', source: 'sample', skin: { hex: '#C08A5E', L: 62, a: 14, b: 26, ita: 25, hue: 59, chroma: 30 }, depth: { id: 'tan' }, undertone: { id: 'warm', confidence: 'high' }, override: null };
  d.photos = { selfie: { source: 'sample', sampleId: 'sample-a' }, body: { source: 'sample', sampleId: 'sample-a' } };
  const gateway = fakeGateway();
  const skin = createSkinService({ gateway: {}, storage, sessions, logger: silentLogger });
  const ledger = createMemoryLedger();
  const fetchOwn = async (url) => (url.includes('body') ? fakeJpeg(800, 1400) : url.endsWith('.png') ? fakePng(600, 700) : fakeJpeg(900, 900));
  const renders = createRenderService({ gateway, storage, sessions, catalogs, skin, ledger, config, logger: silentLogger, fetchOwn, safeFetcher: {} });
  const trace = createTraceStore();
  const agent = createAgentService({ config, logger: silentLogger, sessions, catalogs, skin, renders, ledger, llm, trace });
  const planner = createPlannerService({ catalogs, skin });
  const session = () => sessions.get('sess-1');
  const settle = async (id) => {
    for (let i = 0; i < 400; i++) {
      const l = await renders.get(await session(), id);
      if (!l.active) return l;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error('look never finished');
  };
  const first = await renders.start(await session(), { itemIds: itemIds() });
  await settle(first.id);
  gateway.calls.length = 0;
  const turn = async (body) => agent.turn(await session(), { lookId: first.id, ...body });
  return { agent, renders, gateway, sessions, session, settle, trace, turn, first, planner, catalogs };
}

// ---------- keyword reader ----------

test('keyword reader: the chips and the PRD example phrases', () => {
  const ops = (m) => readRequest(m).ops;
  assert.deepEqual(ops('less formal, warmer lipstick'), [{ op: 'change_formality', shift: -1 }, { op: 'change_lipstick', change: 'warmer' }]);
  assert.deepEqual(ops('more formal'), [{ op: 'change_formality', shift: 1 }]);
  assert.deepEqual(ops('make it cheaper'), [{ op: 'make_cheaper' }]);
  assert.deepEqual(ops('Swap the earrings'), [{ op: 'swap_item', slot: 'earrings' }]);
  assert.deepEqual(ops('different jewellery'), [{ op: 'swap_item', slot: 'necklace' }, { op: 'swap_item', slot: 'earrings' }]);
  assert.deepEqual(ops('gold jewellery only'), [{ op: 'change_metal', metal: 'gold' }]);
  assert.deepEqual(ops('rose gold jewellery please'), [{ op: 'change_metal', metal: 'rose-gold' }]);
  assert.deepEqual(ops('keep it under 15k'), [{ op: 'change_budget', budgetInr: 15000 }]);
  assert.deepEqual(ops('budget of ₹18,000'), [{ op: 'change_budget', budgetInr: 18000 }]);
  assert.deepEqual(ops('something in blue'), [{ op: 'change_colour_family', families: ['navy', 'royal-blue', 'powder-blue', 'teal'] }]);
  assert.deepEqual(ops('a different colour'), [{ op: 'change_colour_family', families: [] }]);
  assert.deepEqual(ops('without the necklace'), [{ op: 'remove_item', slot: 'necklace' }]);
  assert.deepEqual(ops("I don't like the earrings"), [{ op: 'exclude_item', slot: 'earrings' }]);
  assert.deepEqual(ops('deeper lipstick'), [{ op: 'change_lipstick', change: 'deeper' }]);
});

test('keyword reader: things a catalog cannot do are unsupported, never guessed', () => {
  const r = readRequest('make the dress longer');
  assert.equal(r.ops.length, 1);
  assert.equal(r.ops[0].op, 'unsupported');
  assert.equal(r.ops[0].slot, 'outfit');
  assert.equal(readRequest('tell me a joke').ops[0].op, 'unsupported');
  assert.equal(readRequest('   ').ops[0].op, 'unsupported');
  // a metal word that describes the garment is not a metal change
  assert.ok(!readRequest('a gold saree').ops.some((o) => o.op === 'change_metal'));
});

test('money parsing and budget limits', () => {
  assert.equal(parseMoney('15k'), 15000);
  assert.equal(parseMoney('₹1,25,000'), 125000);
  assert.equal(parseMoney('1.5 lakh'), 150000);
  assert.deepEqual(readRequest('under 500').ops[0].op, 'unsupported'); // below the minimum budget
  assert.match(readRequest('under 500').notes.join(' '), /between/);
});

test('every chip is a valid list of operations', () => {
  for (const c of CHIPS) {
    const { ops, rejected } = validateOps(opsForChip(c.id));
    assert.equal(rejected.length, 0, c.id);
    assert.ok(ops.length >= 1);
  }
  assert.equal(opsForChip('nope'), null);
});

test('validateOps keeps good operations, drops bad ones, and caps the count', () => {
  const { ops, rejected } = validateOps([
    { op: 'change_formality', shift: -1 }, { op: 'change_formality', shift: 0 }, { op: 'swap_item', slot: 'hat' },
    { op: 'rm -rf' }, { op: 'change_budget', budgetInr: 1 }, { op: 'change_metal', metal: 'gold' },
    { op: 'make_cheaper' }, { op: 'make_cheaper' }, { op: 'make_cheaper' },
  ]);
  assert.equal(ops.length, 4);
  assert.ok(rejected.length >= 4);
  assert.equal(validateOps('not an array').ops.length, 0);
});

test('turn body: exactly one of message, chip or action, with limits', () => {
  const id = 'look_0123456789';
  assert.throws(() => parseTurnBody({}), /Say which look/);
  assert.throws(() => parseTurnBody({ lookId: id }), /Type a request/);
  assert.throws(() => parseTurnBody({ lookId: id, message: 'a', chip: 'cheaper' }), /Type a request/);
  assert.throws(() => parseTurnBody({ lookId: id, message: 'x'.repeat(301) }), /under 300/);
  assert.throws(() => parseTurnBody({ lookId: id, chip: 'unknown' }), /not available/);
  assert.throws(() => parseTurnBody({ lookId: id, action: { op: 'make_cheaper' } }), /not available/);
  assert.equal(parseTurnBody({ lookId: id, message: '  warmer   lipstick ' }).message, 'warmer lipstick');
  assert.equal(parseTurnBody({ lookId: id, chip: 'cheaper' }).chip, 'cheaper');
});

// ---------- language model adapters ----------

test('anthropic adapter forces the tool and reads its input', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, body: JSON.parse(init.body), headers: init.headers };
    return { ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'apply_refinement', input: { operations: [{ op: 'make_cheaper' }] } }] }) };
  };
  const llm = createLlm({ config: { provider: 'anthropic', apiKey: 'k' }, fetchImpl });
  assert.equal(llm.available, true);
  const ops = await llm.readRequest({ message: 'cheaper', occasion: 'festive', budgetInr: 10000, items: [{ slot: 'outfit', id: 'a', name: 'A', price: 1 }] });
  assert.deepEqual(ops, [{ op: 'make_cheaper' }]);
  assert.match(seen.url, /\/v1\/messages$/);
  assert.equal(seen.headers['x-api-key'], 'k');
  assert.deepEqual(seen.body.tool_choice, { type: 'tool', name: 'apply_refinement' });
  assert.ok(seen.body.messages[0].content.includes('<<<'));
  assert.ok(!JSON.stringify(seen.body).includes('skin'), 'no skin data is sent');
});

test('openai-compatible adapter reads function arguments', async () => {
  const fetchImpl = async (url) => ({ ok: true, json: async () => ({ choices: [{ message: { tool_calls: [{ function: { arguments: JSON.stringify({ reply: 'Done.', mentionedItemIds: [] }) } }] } }], url }) });
  const llm = createLlm({ config: { provider: 'openai', apiKey: 'k', baseUrl: 'https://llm.test/v1/' }, fetchImpl });
  assert.deepEqual(await llm.writeReply({ changes: [] }), { reply: 'Done.', mentionedItemIds: [] });
});

test('adapter errors become typed errors, and no key means unavailable', async () => {
  assert.equal(createLlm({ config: { provider: 'none' } }).available, false);
  assert.equal(createLlm({ config: { provider: 'anthropic', apiKey: '' } }).available, false);
  const bad = createLlm({ config: { provider: 'anthropic', apiKey: 'k' }, fetchImpl: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(bad.readRequest({ message: 'x', occasion: 'o', budgetInr: 1, items: [] }), (e) => e instanceof LlmError && e.code === 'LLM_RATE_LIMIT');
  const junk = createLlm({ config: { provider: 'anthropic', apiKey: 'k' }, fetchImpl: async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'hi' }] }) }) });
  await assert.rejects(junk.readRequest({ message: 'x', occasion: 'o', budgetInr: 1, items: [] }), (e) => e.code === 'LLM_BAD_OUTPUT');
});

test('model replies are accepted only inside the facts', () => {
  const ctx = { allowedIds: ['a', 'b'], allowedAmounts: new Set([2400, 900, 1500]) };
  assert.equal(checkReply({ reply: 'Swapped to the studs for ₹900.', mentionedItemIds: ['a'] }, ctx), 'Swapped to the studs for ₹900.');
  assert.equal(checkReply({ reply: 'Swapped for ₹1,500.', mentionedItemIds: [] }, ctx), 'Swapped for ₹1,500.');
  assert.equal(checkReply({ reply: 'It costs ₹9,999.', mentionedItemIds: [] }, ctx), null, 'invented amount');
  assert.equal(checkReply({ reply: 'Nice.', mentionedItemIds: ['zzz'] }, ctx), null, 'invented item id');
  assert.equal(checkReply({ reply: 'x'.repeat(600), mentionedItemIds: [] }, ctx), null, 'too long');
  assert.equal(checkReply({ reply: '', mentionedItemIds: [] }, ctx), null);
});

// ---------- trace ----------

test('trace store: begin, update, finish, list, subscribe, clear, ring limit', () => {
  let t = 1000;
  const store = createTraceStore({ now: () => t, maxPerSession: 3 });
  const seen = [];
  const off = store.subscribe('s', (e) => seen.push(e.cleared ? 'cleared' : `${e.id}:${e.status}`));
  const id = store.begin('s', { tool: 'x', input: 'in' });
  t += 50;
  store.update('s', id, { status: 'running' });
  store.finish('s', id, { status: 'ok', outcome: 'fine' });
  assert.equal(store.list('s')[0].durationMs, 50);
  assert.deepEqual(seen, ['s1:running', 's1:running', 's1:ok']);
  for (let i = 0; i < 5; i++) store.add('s', { tool: `t${i}` });
  assert.equal(store.list('s').length, 3);
  off();
  store.clear('s');
  assert.equal(store.list('s').length, 0);
});

// ---------- full turns ----------

test('chip "less formal" changes only the outfit and draws only the outfit', async () => {
  const t = await boot();
  const out = await t.agent.turn(await t.session(), { lookId: t.first.id, chip: 'less_formal' });
  assert.equal(out.turn.unchanged, false);
  assert.deepEqual(out.turn.changes.map((c) => c.slot), ['outfit']);
  const [change] = out.turn.changes;
  assert.notEqual(change.from.id, change.to.id);
  const items = await catalogItems(t);
  assert.ok(items.get(change.to.id).formality < items.get(change.from.id).formality, 'really less formal');
  assert.notEqual(out.turn.lookId, t.first.id);
  assert.equal(out.turn.mode, 'chip');
  await t.settle(out.turn.lookId);
  assert.deepEqual(t.gateway.calls.map((c) => c.feature), ['cloth-v4'], 'only the outfit was drawn');
  assert.deepEqual(out.turn.draw.redraw.includes('Outfit'), true);
  assert.ok(out.turn.look.totalPrice <= 25000);
});

async function catalogItems(t) {
  const { items } = await t.catalogs.itemsForSession(await t.session());
  return new Map(items.map((i) => [i.id, i]));
}

test('"less formal, warmer lipstick" typed without a language model changes outfit and lipstick only', async () => {
  const t = await boot();
  const out = await t.turn({ message: 'less formal, warmer lipstick' });
  assert.equal(out.turn.mode, 'rules');
  assert.deepEqual(out.turn.changes.map((c) => c.slot).sort(), ['lipstick', 'outfit']);
  const items = await catalogItems(t);
  const lip = out.turn.changes.find((c) => c.slot === 'lipstick');
  assert.ok(lip.to.id !== lip.from.id);
  assert.ok(items.get(lip.to.id));
  await t.settle(out.turn.lookId);
  assert.deepEqual(t.gateway.calls.map((c) => c.feature).sort(), ['cloth-v4', 'makeup-vto']);
  // the trace shows each step with its cost
  const steps = t.trace.list('sess-1');
  const tools = steps.map((s) => s.tool);
  for (const name of ['get_profile', 'search_catalog', 'parse_intent', 'swap_item', 'score_look', 'get_budget_status', 'explain_look', 'render_look']) assert.ok(tools.includes(name), `trace has ${name}`);
  const drawn = steps.filter((s) => s.tool.startsWith('youcam/'));
  assert.equal(drawn.length, 2);
  assert.ok(drawn.every((s) => s.status === 'ok' && s.units === 1 && s.durationMs >= 0));
  const cached = steps.filter((s) => s.tool === 'cache');
  assert.equal(cached.length, 2, 'earrings and necklace were reused');
  const render = steps.find((s) => s.tool === 'render_look');
  assert.equal(render.status, 'ok');
  assert.equal(render.units, 2);
});

test('budget stays a hard limit, and lowering it swaps to cheaper pieces or refuses', async () => {
  const t = await boot();
  const ok = await t.turn({ message: 'keep it under 6500' });
  assert.equal(ok.turn.unchanged, false);
  assert.ok(ok.turn.look.totalPrice <= 6500);
  assert.equal((await t.session()).preferences.budgetInr, 6500);
  await t.settle(ok.turn.lookId);

  const t2 = await boot();
  const no = await t2.agent.turn(await t2.session(), { lookId: t2.first.id, message: 'budget 2000' });
  assert.equal(no.turn.unchanged, true);
  assert.match(no.turn.failures[0], /cheapest version/);
  assert.equal((await t2.session()).preferences.budgetInr, 25000, 'budget is not lowered when nothing fits');
  assert.equal(t2.gateway.calls.length, 0);
});

test('exclude keeps an item out of this look and every later plan', async () => {
  const t = await boot();
  const out = await t.turn({ message: "I don't like the earrings" });
  const c = out.turn.changes.find((x) => x.slot === 'earrings');
  assert.ok(c.to && c.to.id !== IDS.earrings);
  assert.ok((await t.session()).agent.excludeItemIds.includes(IDS.earrings));
  const plan = await t.planner.planForSession(await t.session());
  for (const l of plan.looks) assert.ok(!l.itemIds.includes(IDS.earrings));
  assert.ok(plan.constraints.excludeItemIds.includes(IDS.earrings));
});

test('metal request switches jewellery and is remembered', async () => {
  const t = await boot();
  const out = await t.turn({ message: 'gold jewellery only' });
  const items = await catalogItems(t);
  for (const c of out.turn.changes) assert.equal(items.get(c.to.id).metalTone, 'gold');
  assert.equal((await t.session()).preferences.metal, 'gold');
});

test('remove drops a jewellery piece and lowers the price', async () => {
  const t = await boot();
  const out = await t.turn({ message: 'without the necklace' });
  assert.equal(out.turn.look.items.necklace, undefined);
  assert.ok(out.turn.look.totalPrice < 7200);
  await t.settle(out.turn.lookId);
  assert.ok(t.gateway.calls.length <= 1, 'dropping the necklace re-draws at most the lipstick');
});

test('a request the catalog cannot meet is explained, with the nearest alternatives and no spend', async () => {
  const t = await boot();
  const out = await t.turn({ message: 'make the dress longer' });
  assert.equal(out.turn.unsupported, true);
  assert.equal(out.turn.unchanged, true);
  assert.ok(out.turn.alternatives.length >= 1 && out.turn.alternatives.length <= 3);
  assert.match(out.turn.reply, /choose from the catalog/);
  assert.equal(t.gateway.calls.length, 0);
  // an alternative can be picked directly
  const pick = out.turn.alternatives[0];
  const after = await t.turn({ action: { op: 'swap_item', slot: pick.slot, itemId: pick.itemId } });
  assert.equal(after.turn.changes[0].to.id, pick.itemId);
});

test('picking an item that busts the budget is refused', async () => {
  const t = await boot({ budgetInr: 7500 });
  const out = await t.turn({ action: { op: 'swap_item', slot: 'outfit', itemId: 'outfit-emerald-lehenga' } });
  assert.equal(out.turn.unchanged, true);
  assert.match(out.turn.failures[0], /over your/);
});

test('language model path: reads the request, writes a checked reply, and counts its calls', async () => {
  const calls = [];
  const llm = {
    available: true, model: 'fake-model', provider: 'anthropic',
    readRequest: async (ctx) => { calls.push(['read', ctx.message]); return [{ op: 'change_lipstick', change: 'deeper' }]; },
    writeReply: async () => { calls.push(['reply']); return { reply: 'Swapped to a deeper lipstick.', mentionedItemIds: [] }; },
  };
  const t = await boot({ llm });
  const out = await t.turn({ message: 'could you do a bolder lip?' });
  assert.equal(out.turn.mode, 'llm');
  assert.equal(out.turn.replySource, 'language-model');
  assert.equal(out.turn.reply, 'Swapped to a deeper lipstick.');
  assert.deepEqual(out.turn.changes.map((c) => c.slot), ['lipstick']);
  assert.equal((await t.session()).agent.llmCalls, 2);
  assert.equal(out.governor.llm.used, 2);
  const tr = t.trace.list('sess-1').find((s) => s.tool === 'parse_intent');
  assert.match(tr.outcome, /language model \(fake-model\)/);
});

test('a model reply that invents a price or an item is replaced by the planner wording', async () => {
  const llm = {
    available: true, model: 'm', provider: 'openai',
    readRequest: async () => [{ op: 'make_cheaper' }],
    writeReply: async () => ({ reply: 'Great news, it is now only ₹1 in total!', mentionedItemIds: [] }),
  };
  const t = await boot({ llm });
  const out = await t.turn({ message: 'cheaper please' });
  assert.equal(out.turn.replySource, 'planner');
  assert.ok(!out.turn.reply.includes('₹1 in total'));
  assert.match(out.turn.reply, /saves/);
});

test('a model that fails or breaks the schema falls back to the keyword reader (FR-28)', async () => {
  const down = { available: true, model: 'm', provider: 'anthropic', readRequest: async () => { throw new LlmError('LLM_TIMEOUT', 'slow'); }, writeReply: async () => { throw new LlmError('LLM_TIMEOUT', 'slow'); } };
  const t = await boot({ llm: down });
  const out = await t.turn({ message: 'warmer lipstick' });
  assert.equal(out.turn.mode, 'rules');
  assert.match(out.turn.llmNote, /simpler reader/);
  assert.deepEqual(out.turn.changes.map((c) => c.slot), ['lipstick']);

  const junk = { available: true, model: 'm', provider: 'anthropic', readRequest: async () => [{ op: 'format_disk' }, { op: 'swap_item', slot: 'hat' }], writeReply: async () => ({ reply: 'ok', mentionedItemIds: [] }) };
  const t2 = await boot({ llm: junk });
  const out2 = await t2.turn({ message: 'warmer lipstick' });
  assert.equal(out2.turn.mode, 'rules');
  assert.deepEqual(out2.turn.changes.map((c) => c.slot), ['lipstick']);
});

test('chips never call the model for reading, and work with no model at all', async () => {
  let reads = 0;
  const llm = { available: true, model: 'm', provider: 'anthropic', readRequest: async () => { reads++; return []; }, writeReply: async () => { throw new LlmError('LLM_ERROR', 'x'); } };
  const t = await boot({ llm });
  const out = await t.turn({ chip: 'cheaper' });
  assert.equal(reads, 0);
  assert.equal(out.turn.unchanged, false);
  assert.equal(out.turn.replySource, 'planner');
});

test('per-session caps: turns stop cleanly, and the model allowance falls back to the keyword reader', async () => {
  const t = await boot({ agentConfig: { sessionTurnCap: 1 } });
  await t.turn({ chip: 'cheaper' });
  await assert.rejects(t.turn({ chip: 'cheaper' }), (e) => e.code === 'AGENT_TURN_CAP' && e.status === 429);

  const llm = { available: true, model: 'm', provider: 'anthropic', readRequest: async () => [{ op: 'make_cheaper' }], writeReply: async () => ({ reply: 'ok', mentionedItemIds: [] }) };
  const t2 = await boot({ llm, agentConfig: { sessionLlmCap: 0 } });
  const out = await t2.turn({ message: 'cheaper' });
  assert.equal(out.turn.mode, 'rules');
  assert.match(out.turn.llmNote, /allowance/);
});

test('one turn at a time, and no change while a look is being drawn', async () => {
  let release;
  const slow = { available: true, model: 'm', provider: 'anthropic', readRequest: () => new Promise((r) => { release = () => r([{ op: 'make_cheaper' }]); }), writeReply: async () => ({ reply: 'ok', mentionedItemIds: [] }) };
  const t = await boot({ llm: slow });
  const p1 = t.turn({ message: 'cheaper' });
  await new Promise((r) => setTimeout(r, 20));
  await assert.rejects(t.turn({ message: 'cheaper' }), (e) => e.code === 'AGENT_BUSY');
  release();
  await p1;

  const t2 = await boot();
  let open;
  t2.gateway.gate = new Promise((r) => { open = r; });
  const a = await t2.turn({ chip: 'cheaper' }); // starts drawing and blocks on the gate
  await assert.rejects(t2.agent.turn(await t2.session(), { lookId: a.turn.lookId, chip: 'less_formal' }), (e) => e.code === 'RENDER_BUSY');
  open();
  await t2.settle(a.turn.lookId);
});

test('a spending cap still records the look and says so, without a crash', async () => {
  const t = await boot();
  t.sessions.docs.get('sess-1').renderRuns = 999;
  const out = await t.turn({ chip: 'cheaper' });
  assert.equal(out.turn.renderError.code, 'RENDER_CAP');
  assert.equal(out.turn.renderError.cap, true);
  assert.ok(out.turn.lookId, 'the new look was saved so it can be drawn later');
  assert.equal(out.governor.state, 'capped');
});

test('governor reports units, renders, turns and model use', async () => {
  const t = await boot();
  const g = await t.agent.governor(await t.session());
  assert.equal(g.units.cap, 50);
  assert.equal(g.turns.cap, 40);
  assert.equal(g.llm.available, false);
  assert.equal(g.perTurn.toolCalls, 6);
  assert.equal(g.state, 'ok');
});

test('delete-everything forgets the trace', async () => {
  const t = await boot();
  await t.turn({ chip: 'cheaper' });
  assert.ok(t.trace.list('sess-1').length > 0);
  t.agent.forget('sess-1');
  assert.equal(t.trace.list('sess-1').length, 0);
});

test('errors: missing look, no profile', async () => {
  const t = await boot();
  await assert.rejects(t.agent.turn(await t.session(), { lookId: 'look_aaaaaaaaaa', chip: 'cheaper' }), (e) => e.code === 'NOT_FOUND');
  delete t.sessions.docs.get('sess-1').skinProfile;
  await assert.rejects(t.turn({ chip: 'cheaper' }), (e) => e.code === 'NO_PROFILE');
  assert.ok(AppError);
});
