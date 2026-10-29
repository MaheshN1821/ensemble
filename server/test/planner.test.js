import test from 'node:test';
import assert from 'node:assert/strict';
import { WEIGHTS, SEARCH } from '../src/config/planner.js';
import { OCCASIONS } from '../src/config/intake.js';
import { UNDERTONES, COLOUR_FAMILIES } from '../src/config/skin.js';
import { SAMPLE_ITEMS } from './fixtures/sampleItems.js';
import { buildContext, resolveOccasion, scoreLook } from '../src/services/planner/score.js';
import { planLooks, rescoreLook, swapItem } from '../src/services/planner/plan.js';
import { createPlannerService, plannerRules } from '../src/services/planner/service.js';
import { parsePlanBody } from '../src/services/planner/input.js';
import { effectiveProfile } from '../src/services/skin/profile.js';

const ITEMS = SAMPLE_ITEMS.map(({ prompt, itemId, ...i }) => ({ ...i, id: itemId, catalogId: 'sample', source: 'sample' }));
const item = (id) => ITEMS.find((i) => i.id === id);
const prefs = (o = {}) => ({ occasion: 'wedding-guest', occasionText: '', budgetInr: 25000, silhouettes: [], metal: 'any', avoidColours: [], notes: '', ...o });
const plan = (o = {}) => planLooks({ items: ITEMS, profile: { depth: 'tan', undertone: 'warm' }, prefs: prefs(o.prefs), constraints: o.constraints, ...(o.profile ? { profile: o.profile } : {}), ...(o.items ? { items: o.items } : {}) });
const strip = (p) => JSON.parse(JSON.stringify({ ...p, plannedInMs: 0 }));
const primary = (i) => [...i.colours].sort((a, b) => b.share - a.share)[0];

test('weights follow the PRD and add up to 100; rules are published', () => {
  assert.deepEqual(WEIGHTS, { colour: 35, occasion: 25, palette: 15, metal: 15, preferences: 10 });
  const r = plannerRules();
  assert.equal(r.weights.reduce((s, w) => s + w.weight, 0), 100);
  assert.match(r.scoreNote, /not a rating of you/);
  assert.match(r.budget, /hard limit/);
});

test('same inputs always return the same looks, whatever order the catalog arrives in', () => {
  const a = plan();
  const b = plan();
  assert.deepEqual(strip(a), strip(b));
  const shuffled = [...ITEMS].reverse().sort((x, y) => (x.id.length % 3) - (y.id.length % 3));
  assert.deepEqual(strip(plan({ items: shuffled })), strip(a));
  assert.deepEqual(a.looks.map((l) => l.id), plan().looks.map((l) => l.id));
});

test('budget is never exceeded, across budgets, undertones and occasions', () => {
  let checked = 0;
  for (const u of UNDERTONES) {
    for (const o of OCCASIONS) {
      for (let budget = 2000; budget <= 60000; budget += 2500) {
        const r = plan({ profile: { depth: 'medium', undertone: u.id }, prefs: { occasion: o.id, budgetInr: budget } });
        for (const l of r.looks) {
          assert.ok(l.totalPrice <= budget, `${u.id}/${o.id}/${budget}: ${l.totalPrice}`);
          assert.equal(l.totalPrice, Object.values(l.items).reduce((s, i) => s + i.price, 0));
          assert.equal(l.withinBudget, true);
          checked++;
        }
        assert.equal(new Set(r.looks.map((l) => l.items.outfit.id)).size, r.looks.length, 'looks use different outfits');
        if (r.status === 'ok') assert.ok(r.looks.length >= 1 && r.looks.length <= 3);
        else { assert.equal(r.looks.length, 0); assert.ok(r.closest.totalPrice > budget); }
      }
    }
  }
  assert.ok(checked > 1000);
});

test('every undertone and occasion gets three different looks at a typical budget', () => {
  for (const u of UNDERTONES) for (const o of OCCASIONS) {
    const r = plan({ profile: { depth: 'tan', undertone: u.id }, prefs: { occasion: o.id, budgetInr: 30000 } });
    assert.equal(r.status, 'ok', `${u.id}/${o.id}`);
    assert.equal(r.looks.length, 3, `${u.id}/${o.id}`);
    assert.equal(new Set(r.looks.map((l) => l.items.outfit.id)).size, 3);
    r.looks.forEach((l, i) => { assert.equal(l.rank, i + 1); assert.ok(l.items.lipstick); });
    assert.deepEqual(r.looks.map((l) => l.score), [...r.looks.map((l) => l.score)].sort((a, b) => b - a), 'listed best first (no explicit asks here)');
  }
});

test('occasion is respected: weddings get dressy outfits, offices get restrained ones', () => {
  const wedding = plan({ prefs: { occasion: 'wedding-guest', budgetInr: 40000 } });
  assert.ok(wedding.looks.every((l) => l.items.outfit.formality >= 3));
  assert.deepEqual(wedding.relaxed, []);
  const office = plan({ prefs: { occasion: 'office', budgetInr: 20000 } });
  assert.ok(office.looks.every((l) => l.items.outfit.formality <= 4));
  assert.ok(office.looks.every((l) => l.items.outfit.formality >= 1));
  // free text is matched to a preset; unmatched text uses balanced defaults and says so
  assert.equal(resolveOccasion({ occasion: 'other', occasionText: 'my cousin’s shaadi' }).id, 'wedding-guest');
  assert.equal(resolveOccasion({ occasion: 'other', occasionText: 'school reunion' }).source, 'default');
});

test('colours to avoid are never relaxed', () => {
  for (const group of ['green', 'black', 'blue']) {
    const r = plan({ prefs: { avoidColours: [group], budgetInr: 60000, occasion: 'cocktail' } });
    for (const l of r.looks) {
      for (const it of Object.values(l.items)) {
        for (const c of it.colours) if (it.type !== 'lipstick') assert.ok(!(COLOUR_FAMILIES[c.family].group === group && c.share >= 0.25), `${group} in ${it.id}`);
      }
    }
  }
});

test('metal preference is honoured, and a missing metal is explained', () => {
  const silver = plan({ prefs: { metal: 'silver', budgetInr: 40000 } });
  for (const l of silver.looks) for (const s of ['necklace', 'earrings']) if (l.items[s]) assert.equal(l.items[s].metalTone, 'silver');
  const noGold = plan({ prefs: { metal: 'gold', budgetInr: 40000 }, items: ITEMS.filter((i) => !(i.metalTone === 'gold')) });
  assert.ok(noGold.notes.some((n) => /no gold/.test(n)));
  assert.ok(noGold.looks.every((l) => !l.items.necklace && !l.items.earrings));
});

test('silhouette choice is kept when possible and relaxed, with a reason, when not', () => {
  const sarees = plan({ prefs: { silhouettes: ['saree'], budgetInr: 40000 } });
  assert.ok(sarees.looks.every((l) => l.items.outfit.silhouette === 'saree'));
  assert.deepEqual(sarees.relaxed, []);
  const lehenga = plan({ prefs: { silhouettes: ['lehenga'], budgetInr: 25000 } });
  assert.equal(lehenga.looks.length, 3);
  assert.ok(lehenga.relaxed.some((r) => r.type === 'no-silhouette'));
  assert.equal(lehenga.looks[0].items.outfit.silhouette, 'lehenga', 'the style they chose still leads');
});

test('nothing within budget: no looks, the closest look, and exactly what was relaxed', () => {
  const r = plan({ prefs: { budgetInr: 2000, occasion: 'brunch' } });
  assert.equal(r.status, 'over_budget');
  assert.equal(r.looks.length, 0);
  assert.equal(r.closest.withinBudget, false);
  assert.equal(r.closest.totalPrice, 2850);
  assert.equal(r.closest.overBy, 850);
  assert.equal(r.minBudgetInr, 2850);
  assert.equal(r.relaxed[0].type, 'budget');
  assert.match(r.relaxed[0].text, /₹850 over your budget/);
  assert.match(r.message, /closest/);
  assert.match(r.closest.summary, /over your/);
});

test('a tight budget returns fewer looks with a note instead of breaking the budget', () => {
  const r = plan({ prefs: { budgetInr: 3000, occasion: 'brunch' } });
  assert.equal(r.status, 'ok');
  assert.ok(r.looks.length >= 1 && r.looks.length < 3);
  assert.ok(r.notes.some((n) => /higher budget/.test(n)));
  r.looks.forEach((l) => assert.ok(l.totalPrice <= 3000));
});

test('explanations come from rules that fired, mention only real items, and use neutral wording', () => {
  for (const o of ['wedding-guest', 'office', 'brunch']) {
    const r = plan({ prefs: { occasion: o, budgetInr: 30000, avoidColours: ['red'], silhouettes: ['saree', 'dress'] } });
    for (const l of r.looks) {
      assert.ok(l.reasons.length >= 2, 'has reasons');
      for (const rule of l.rules) for (const id of rule.itemIds) assert.ok(l.itemIds.includes(id), `rule mentions ${id} outside the look`);
      const text = [...l.reasons, ...l.cautions, l.summary].join(' ');
      for (const it of Object.values(l.items)) assert.ok(l.summary.includes(it.name));
      assert.ok(!/\b(better|worse|attractive|beautiful|ugly|flatter|fair skin|dark skin|ideal)\b/i.test(text), text);
      const pts = Object.values(l.components).reduce((s, c) => s + c.points, 0);
      assert.ok(Math.abs(pts - l.score) <= 1, 'score is the sum of its parts');
      assert.ok(l.score >= 0 && l.score <= 100);
    }
  }
});

test('a changed undertone changes the metal and colour scoring (the override reaches the planner)', () => {
  const look = { outfit: item('outfit-maroon-silk-saree'), necklace: item('necklace-gold-kundan'), earrings: item('earrings-gold-jhumka'), lipstick: item('lipstick-coral') };
  const warm = scoreLook(look, buildContext({ profile: { depth: 'tan', undertone: 'warm' }, prefs: prefs() }));
  const cool = scoreLook(look, buildContext({ profile: { depth: 'tan', undertone: 'cool' }, prefs: prefs() }));
  assert.ok(warm.components.metal.points > cool.components.metal.points);
  assert.ok(warm.total > cool.total);
  const eff = effectiveProfile({ depth: { id: 'tan' }, undertone: { id: 'warm' }, override: { undertone: 'cool' } });
  assert.equal(eff.undertone, 'cool');
});

test('mixed metals and missing jewellery are scored and explained, not hidden', () => {
  const ctx = buildContext({ profile: { depth: 'tan', undertone: 'warm' }, prefs: prefs() });
  const mixed = scoreLook({ outfit: item('outfit-maroon-silk-saree'), necklace: item('necklace-gold-temple'), earrings: item('earrings-silver-studs'), lipstick: item('lipstick-brick') }, ctx);
  assert.ok(mixed.rules.some((r) => r.code === 'metal-mixed'));
  const bare = scoreLook({ outfit: item('outfit-maroon-silk-saree'), lipstick: item('lipstick-brick') }, ctx);
  assert.ok(bare.rules.some((r) => r.code === 'jewellery-light' || r.code === 'metal-none'));
  assert.ok(bare.total < 98);
});

test('swapItem keeps the budget, changes only that slot, and explains when there is no alternative', () => {
  const r = plan({ prefs: { budgetInr: 30000 } });
  const look = r.looks[0];
  const out = swapItem({ look, slot: 'necklace', items: ITEMS, profile: { depth: 'tan', undertone: 'warm' }, prefs: prefs({ budgetInr: 30000 }) });
  assert.equal(out.ok, true);
  assert.notEqual(out.look.items.necklace.id, look.items.necklace.id);
  assert.equal(out.look.items.outfit.id, look.items.outfit.id);
  assert.ok(out.look.totalPrice <= 30000);
  const tight = swapItem({ look: { ...look, items: { outfit: item('outfit-ivory-kurta'), lipstick: item('lipstick-coral') } }, slot: 'outfit', items: ITEMS, profile: { depth: 'tan', undertone: 'warm' }, prefs: prefs({ budgetInr: 2850 }) });
  assert.equal(tight.ok, false);
  assert.equal(tight.reason, 'NO_ALTERNATIVE');
  assert.equal(swapItem({ look, slot: 'hat', items: ITEMS, profile: { depth: 'tan', undertone: 'warm' }, prefs: prefs() }).reason, 'BAD_SLOT');
  const re = rescoreLook({ look, profile: { depth: 'tan', undertone: 'warm' }, prefs: prefs({ budgetInr: 30000 }) });
  assert.equal(re.score, look.score);
  assert.equal(re.id, look.id);
});

test('refinement constraints: exclude an item, change budget, formality shift, metal, colour family', () => {
  const base = plan();
  const topOutfit = base.looks[0].items.outfit.id;
  assert.ok(!plan({ constraints: { excludeItemIds: [topOutfit] } }).looks.some((l) => l.items.outfit.id === topOutfit));
  assert.ok(plan({ constraints: { budgetInr: 12000 } }).looks.every((l) => l.totalPrice <= 12000));
  const casual = plan({ prefs: { occasion: 'wedding-guest' }, constraints: { formalityShift: -2 } });
  assert.ok(casual.looks.some((l) => l.items.outfit.formality <= 3));
  const silver = plan({ constraints: { forceMetal: 'silver', budgetInr: 40000 } });
  assert.ok(silver.looks.every((l) => [l.items.necklace, l.items.earrings].filter(Boolean).every((j) => j.metalTone === 'silver')));
  const blue = plan({ prefs: { budgetInr: 40000 }, constraints: { preferFamilies: ['royal-blue', 'navy'] } });
  assert.ok(['royal-blue', 'navy'].includes(primary(blue.looks[0].items.outfit).family));
});

test('odd catalogs do not break the planner: no outfits, no lipsticks, unreadable colours', () => {
  const none = plan({ items: ITEMS.filter((i) => i.type !== 'outfit') });
  assert.equal(none.status, 'no_items');
  const noLip = plan({ items: ITEMS.filter((i) => i.type !== 'lipstick'), prefs: { budgetInr: 30000 } });
  assert.equal(noLip.status, 'ok');
  assert.ok(noLip.looks.every((l) => !l.items.lipstick));
  const blind = ITEMS.map((i) => (i.type === 'outfit' ? { ...i, colours: [], colourSource: 'none' } : i));
  const r = plan({ items: blind, prefs: { budgetInr: 30000 } });
  assert.equal(r.looks.length, 3);
  assert.ok(r.looks[0].cautions.some((c) => /could not read the colours/.test(c)));
});

test('a large merchant catalog still plans well inside the 5 second target', () => {
  const big = [];
  for (let n = 0; n < 12; n++) for (const i of ITEMS) big.push({ ...i, id: `${i.id}-${n}`, price: i.price + n * 137, catalogId: 'big', source: 'merchant' });
  assert.ok(big.length >= 360);
  const t = Date.now();
  const r = plan({ items: big, prefs: { budgetInr: 60000 } });
  const ms = Date.now() - t;
  assert.equal(r.looks.length, 3);
  assert.ok(ms < 4000, `took ${ms} ms`);
  assert.deepEqual(strip(plan({ items: big, prefs: { budgetInr: 60000 } })), strip(r));
});

test('plan request validation', () => {
  assert.deepEqual(parsePlanBody(undefined), {});
  assert.deepEqual(parsePlanBody({ budgetInr: 15000, excludeItemIds: ['a', 'a', 'b'] }), { budgetInr: 15000, excludeItemIds: ['a', 'b'] });
  for (const bad of [{ budgetInr: 10 }, { budgetInr: 'lots' }, { budgetInr: 12.5 }, { excludeItemIds: 'x' }, { excludeItemIds: [1] }, { excludeItemIds: Array(31).fill('a') }]) {
    assert.throws(() => parsePlanBody(bad), { code: 'INVALID_INPUT' });
  }
});

test('planner service: needs consent, preferences and a skin profile, then plans from the session catalog', async () => {
  const stored = { selfieKey: 'k', depth: { id: 'tan' }, undertone: { id: 'warm', confidence: 'high' }, skin: { hex: '#C08A5E' }, override: null };
  const skin = { current: (s) => s.skinProfile ?? null, present: () => ({ undertone: { label: 'Warm' }, depth: { label: 'Tan' } }) };
  const seen = [];
  const catalogs = { itemsForSession: async (s) => { seen.push(s.catalogId ?? null); return { catalog: { id: 'sample', name: 'Sample catalog', source: 'sample', itemCount: ITEMS.length }, items: ITEMS, fellBack: false }; } };
  const svc = createPlannerService({ catalogs, skin });
  const base = { consent: { over18: true }, preferences: prefs(), skinProfile: stored };
  await assert.rejects(svc.planForSession({ ...base, consent: null }), { code: 'CONSENT_REQUIRED' });
  await assert.rejects(svc.planForSession({ ...base, preferences: null }), { code: 'PREFERENCES_REQUIRED' });
  await assert.rejects(svc.planForSession({ ...base, skinProfile: null }), { code: 'NO_PROFILE' });
  const out = await svc.planForSession({ ...base, catalogId: 'abc' });
  assert.equal(out.status, 'ok');
  assert.equal(out.looks.length, 3);
  assert.equal(out.catalog.name, 'Sample catalog');
  assert.equal(out.profile.undertoneLabel, 'Warm');
  assert.deepEqual(seen, ['abc']);
  // an override on the stored profile reaches the planner
  const over = await svc.planForSession({ ...base, skinProfile: { ...stored, override: { undertone: 'cool' } } });
  assert.equal(over.profile.undertone, 'cool');
  assert.notDeepEqual(over.looks.map((l) => l.id), out.looks.map((l) => l.id));
  assert.ok(SEARCH.looks === 3);
});
