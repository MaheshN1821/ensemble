import { createHash } from 'node:crypto';
import { SCORE_NOTE, SEARCH, WEIGHTS, COMPONENTS } from '../../config/planner.js';
import { COLOUR_FAMILIES } from '../../config/skin.js';
import {
  JEWELLERY, avoidedPrimary, buildContext, formalityDistance, lipFit, metalFit, primaryColour, round, scoreLook,
} from './score.js';
import { explainLook } from './explain.js';

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const lookId = (items) => `look_${createHash('sha1').update(Object.entries(items).filter(([, v]) => v).map(([k, v]) => `${k}:${v.id}`).sort().join('|')).digest('hex').slice(0, 10)}`;
const priceOf = (items) => Object.values(items).reduce((s, i) => s + (i?.price ?? 0), 0);

/** Item pools by slot, sorted so the result never depends on the order the catalog returned items in. */
function pools(items, ctx) {
  const usable = items.filter((i) => !ctx.excludeItemIds.has(i.id)).sort(byId);
  const by = (t) => usable.filter((i) => i.type === t);
  return {
    outfit: by('outfit'),
    earrings: by('earrings'),
    lipstick: by('lipstick'),
    blush: by('blush'),
    foundation: by('foundation'),
  };
}

/** Which outfits may be considered at a relaxation level. Colours to avoid are never relaxed. */
function eligibleOutfits(list, ctx, level) {
  return list.filter((o) => {
    if (avoidedPrimary(o, ctx)) return false;
    if (formalityDistance(o.formality, ctx.occasion.formality) > level.formalityDistance) return false;
    if (level.silhouette && ctx.silhouettes.length && !ctx.silhouettes.includes(o.silhouette)) return false;
    return true;
  });
}

// Relaxation ladder: preferences give way before the occasion does. Budget is never on it.
const WIDER = 'There were not enough outfits for this occasion within your budget, so we included some that are a little more casual or dressier than usual.';
const LEVELS = [
  { id: 'full', silhouette: true, formalityDistance: SEARCH.formalityDistance, note: null },
  { id: 'no-silhouette', silhouette: false, formalityDistance: SEARCH.formalityDistance, note: 'There were not enough outfits in the styles you chose within your budget, so we also looked at other styles.' },
  ...SEARCH.relaxedFormalityDistances.map((d) => ({ id: `formality-${d}`, silhouette: false, formalityDistance: d, note: WIDER })),
];
const dedupeNotes = (levels) => [...new Map(levels.filter((l) => l.note).map((l) => [l.note, { type: l.id, text: l.note }])).values()];

/** Jewellery and lipstick candidates for a slot: best few on their own merits, plus the cheapest few so tight budgets still work. */
function slotCandidates(slot, list, ctx) {
  let eligible = list;
  if (JEWELLERY.includes(slot)) {
    eligible = list.filter((j) => !(ctx.metalPref && j.metalTone !== ctx.metalPref) && !colourAvoided(j, ctx));
  }
  const standalone = (j) => {
    if (slot === 'lipstick') return lipFit(primaryColour(j)?.hex ?? '#C21F2F', ctx).value;
    const f = metalFit(j, ctx);
    const occ = Math.max(0, 1 - formalityDistance(j.formality, ctx.occasion.formality) * 0.35);
    const tag = ctx.occasion.id && j.occasions?.includes(ctx.occasion.id) ? 0.1 : 0;
    return f * 0.5 + occ * 0.4 + tag;
  };
  const ranked = [...eligible].sort((a, b) => standalone(b) - standalone(a) || a.price - b.price || byId(a, b));
  const cheapest = [...eligible].sort((a, b) => a.price - b.price || byId(a, b)).slice(0, SEARCH.cheapestExtra);
  const top = ranked.slice(0, slot === 'lipstick' ? SEARCH.topLipsticks : SEARCH.topPerSlot);
  const seen = new Set();
  return [...top, ...cheapest].filter((j) => (seen.has(j.id) ? false : seen.add(j.id))).sort(byId);
}

const colourAvoided = (item, ctx) => (item.colours ?? []).some((c) => c.share >= 0.25 && ctx.avoidGroups.has(COLOUR_FAMILIES[c.family]?.group));

function candidateSets(p, ctx) {
  return {
    earrings: [null, ...slotCandidates('earrings', p.earrings ?? [], ctx)],
    lipstick: (p.lipstick ?? []).length ? slotCandidates('lipstick', p.lipstick, ctx) : [null],
    blush: (p.blush ?? []).length ? slotCandidates('blush', p.blush, ctx) : [null],
    foundation: (p.foundation ?? []).length ? slotCandidates('foundation', p.foundation, ctx) : [null],
  };
}

/** Best look for one outfit within the budget, or null when nothing (not even the cheapest pieces) fits. */
function bestForOutfit(outfit, sets, ctx, budget) {
  let best = null;
  for (const l of sets.lipstick) {
    const base = outfit.price + (l?.price ?? 0);
    if (base > budget) continue;
    for (const e of sets.earrings) {
      const withE = base + (e?.price ?? 0);
      if (withE > budget) continue;
      for (const b of sets.blush) {
        const withBlush = withE + (b?.price ?? 0);
        if (withBlush > budget) continue;
        for (const f of sets.foundation) {
          const total = withBlush + (f?.price ?? 0);
          if (total > budget) continue;
          const items = { outfit, earrings: e, lipstick: l, blush: b, foundation: f };
          const s = scoreLook(items, ctx);
          const itemCount = Object.values(items).filter(Boolean).length;
          if (!best || itemCount > best.itemCount || (itemCount === best.itemCount && (s.exact > best.s.exact + 1e-9 || (Math.abs(s.exact - best.s.exact) <= 1e-9 && total < best.total)))) {
            best = { items, s, total, itemCount };
          }
        }
      }
    }
  }
  return best;
}

function finish(found, ctx, rank, { withinBudget = true } = {}) {
  const items = Object.fromEntries(Object.entries(found.items).filter(([, v]) => v));
  const look = {
    id: lookId(items),
    rank,
    items,
    itemIds: Object.values(items).map((i) => i.id),
    totalPrice: found.total ?? priceOf(items),
    budgetInr: ctx.budget,
    withinBudget,
    score: found.s.total,
    components: Object.fromEntries(Object.entries(found.s.components).map(([k, v]) => [k, { label: COMPONENTS[k].label, ...v }])),
    rules: found.s.rules,
  };
  look.overBy = withinBudget ? 0 : look.totalPrice - ctx.budget;
  return { ...look, ...explainLook(look, ctx) };
}

/** How many explicit asks an outfit satisfies: a style the shopper chose, a colour direction they requested. */
function askMatches(outfit, ctx) {
  let n = 0;
  if (ctx.silhouettes.length && ctx.silhouettes.includes(outfit.silhouette)) n++;
  if (ctx.preferFamilies.size && (outfit.colours ?? []).some((c) => ctx.preferFamilies.has(c.family) && c.share >= 0.25)) n++;
  return n;
}

/** Greedy pick of three looks with different outfits; later picks lose a few points for repeating a colour or silhouette. */
function pickDiverse(found, ctx, count) {
  const sorted = [...found].sort((a, b) => b.s.exact - a.s.exact || a.total - b.total || byId(a.items.outfit, b.items.outfit));
  const chosen = [];
  const pool = [...sorted];
  while (chosen.length < count && pool.length) {
    let bestIdx = 0;
    let bestAdj = -Infinity;
    pool.forEach((f, idx) => {
      const fam = primaryColour(f.items.outfit)?.family;
      let adj = f.s.exact + SEARCH.askBonus * askMatches(f.items.outfit, ctx);
      for (const c of chosen) {
        if (fam && fam === primaryColour(c.items.outfit)?.family) adj -= SEARCH.diversityPenalty.sameFamily;
        if (f.items.outfit.silhouette && f.items.outfit.silhouette === c.items.outfit.silhouette) adj -= SEARCH.diversityPenalty.sameSilhouette;
      }
      if (adj > bestAdj + 1e-9) { bestAdj = adj; bestIdx = idx; }
    });
    chosen.push(pool.splice(bestIdx, 1)[0]);
  }
  return chosen;
}

/**
 * The planner. Pure and deterministic: same inputs, same output, whatever order the catalog items arrive in.
 * @param items catalog items as presented by the catalog service (ids under `id`)
 * @param profile { depth, undertone } effective values
 * @param prefs intake preferences
 * @param constraints optional refinements (Stage 7 maps typed requests onto these): { excludeItemIds, budgetInr, formalityShift, forceMetal, preferFamilies }
 */
export function planLooks({ items, profile, prefs, constraints = {} }) {
  const started = Date.now();
  const ctx = buildContext({ profile, prefs, constraints });
  const budget = ctx.budget;
  const p = pools(items, ctx);
  const sets = candidateSets(p, ctx);
  const base = {
    budgetInr: budget,
    occasion: { id: ctx.occasion.id, label: ctx.occasion.label, source: ctx.occasion.source, formality: ctx.occasion.formality },
    weights: Object.entries(WEIGHTS).map(([key, weight]) => ({ key, weight, label: COMPONENTS[key].label, blurb: COMPONENTS[key].blurb })),
    scoreNote: SCORE_NOTE,
  };
  const notes = [];
  const finishPlan = (extra) => ({ ...base, notes, ...extra, plannedInMs: Date.now() - started });

  if (!p.outfit.length) {
    return finishPlan({ status: 'no_items', looks: [], closest: null, relaxed: [], minBudgetInr: null, message: 'This catalog has no outfits to plan from. Ask a retailer to add outfits.' });
  }
  const plannedJewellery = ['earrings'];
  if (plannedJewellery.some((s) => ctx.metalPref && p[s].length && !sets[s].some(Boolean))) {
    const slots = plannedJewellery.filter((s) => p[s].length && !sets[s].some(Boolean)).map((s) => s);
    notes.push(`There are no ${ctx.metalPref.replace('-', ' ')} ${slots.join(' or ')} in this catalog, so these looks leave ${slots.length > 1 ? 'them' : 'it'} out.`);
  }

  // Try the ladder until three outfits have a look within budget.
  let chosenLevel = 0;
  let feasible = [];
  for (let li = 0; li < LEVELS.length; li++) {
    const outfits = eligibleOutfits(p.outfit, ctx, LEVELS[li]);
    feasible = outfits.map((o) => bestForOutfit(o, sets, ctx, budget)).filter(Boolean);
    chosenLevel = li;
    if (feasible.length >= SEARCH.looks) break;
  }
  const relaxed = dedupeNotes(LEVELS.slice(1, chosenLevel + 1));
  // A relaxed level that added nothing over the stricter one should not be reported.
  const strict = eligibleOutfits(p.outfit, ctx, LEVELS[0]).map((o) => bestForOutfit(o, sets, ctx, budget)).filter(Boolean);
  const reported = feasible.length > strict.length ? relaxed : [];
  if (feasible.length <= strict.length) feasible = strict;

  if (feasible.length) {
    const picked = pickDiverse(feasible, ctx, SEARCH.looks);
    if (picked.length < SEARCH.looks) {
      const eligible = eligibleOutfits(p.outfit, ctx, LEVELS[chosenLevel]);
      const affordableIds = new Set(picked.map((f) => f.items.outfit.id));
      const overBudget = eligible
        .filter((o) => !affordableIds.has(o.id))
        .map((o) => bestForOutfit(o, sets, ctx, Number.POSITIVE_INFINITY))
        .filter(Boolean)
        .sort((a, b) => b.itemCount - a.itemCount || b.s.exact - a.s.exact || a.total - b.total || byId(a.items.outfit, b.items.outfit));
      for (const candidate of overBudget) {
        if (picked.length >= SEARCH.looks) break;
        picked.push(candidate);
      }
      if (picked.some((f) => f.total > budget)) {
        notes.push(`Some complete looks exceed your ${money(budget)} budget. You can still choose one, or build your own look to control the pieces and price.`);
      }
    }
    // Diversity decides WHICH looks are shown. They are listed with explicit asks first, then best score first.
    picked.sort((a, b) => askMatches(b.items.outfit, ctx) - askMatches(a.items.outfit, ctx) || b.s.exact - a.s.exact || a.total - b.total || byId(a.items.outfit, b.items.outfit));
    const looks = picked.map((f, i) => finish(f, ctx, i + 1, { withinBudget: f.total <= budget }));
    if (looks.length < SEARCH.looks) notes.push(`Only ${looks.length === 1 ? 'one look fits' : `${looks.length} looks fit`} your budget and choices. A higher budget shows more.`);
    const cheapest = Math.min(...feasible.map((f) => f.total));
    return finishPlan({ status: 'ok', looks, closest: null, relaxed: reported, minBudgetInr: cheapest, message: null });
  }

  // Nothing fits the budget: show the closest look and say exactly what was relaxed (FR-17).
  let outfits = [];
  let lvl = 0;
  for (; lvl < LEVELS.length; lvl++) { outfits = eligibleOutfits(p.outfit, ctx, LEVELS[lvl]); if (outfits.length) break; }
  if (!outfits.length) {
    return finishPlan({ status: 'no_items', looks: [], closest: null, relaxed: [], minBudgetInr: null, message: 'No outfit in this catalog suits this occasion and your colour choices. Try another occasion or catalog.' });
  }
  const cheapest = (list) => [...list].sort((a, b) => a.price - b.price || byId(a, b))[0] ?? null;
  const outfit = [...outfits].sort((a, b) => a.price - b.price || byId(a, b))[0];
  const lipstick = cheapest(sets.lipstick.filter(Boolean));
  const closestItems = { outfit, earrings: null, lipstick, eyewear: null, watch: null };
  const total = priceOf(closestItems);
  const found = { items: closestItems, s: scoreLook(closestItems, ctx), total };
  const closest = finish(found, ctx, 1, { withinBudget: false });
  const overBy = total - budget;
  const relaxations = [{ type: 'budget', text: `Nothing fits ${money(budget)}. The closest look is ${money(total)}, which is ${money(overBy)} over your budget.` }, ...dedupeNotes(LEVELS.slice(1, lvl + 1))];
  return finishPlan({
    status: 'over_budget',
    looks: [],
    closest,
    relaxed: relaxations,
    minBudgetInr: total,
    message: `No look fits ${money(budget)}. The closest we can build is ${money(total)}: ${outfit.name}${lipstick ? ` with ${lipstick.name}` : ''}, with no jewellery.`,
  });
}

/**
 * Swaps one item in a look for the best replacement that keeps the look within budget (the `swap_item` tool).
 * `filter(item)` optionally narrows the candidates first (Stage 7: "cheaper", "warmer", "less formal").
 * Returns { ok:true, look } or { ok:false, reason, message }.
 */
export function swapItem({ look, slot, items, profile, prefs, constraints = {}, filter = null }) {
  const ctx = buildContext({ profile, prefs, constraints });
  const current = look.items[slot];
  const exclude = new Set([...ctx.excludeItemIds, current?.id].filter(Boolean));
  const p = pools(items.filter((i) => !exclude.has(i.id)), { ...ctx, excludeItemIds: new Set() });
  let candidates = p[slot];
  if (!candidates) return { ok: false, reason: 'BAD_SLOT', message: 'You can swap the outfit, earrings, lipstick, eyewear or watch.' };
  if (slot === 'outfit') candidates = eligibleOutfits(candidates, ctx, LEVELS.at(-1));
  if (JEWELLERY.includes(slot)) candidates = candidates.filter((j) => !(ctx.metalPref && j.metalTone !== ctx.metalPref) && !colourAvoided(j, ctx));
  // `filter` lets a caller ask for a direction (cheaper, warmer, less formal) while the planner still scores and picks.
  if (typeof filter === 'function') candidates = candidates.filter(filter);
  const rest = priceOf({ ...look.items, [slot]: null });
  let best = null;
  for (const c of candidates) {
    if (rest + c.price > ctx.budget) continue;
    const next = { ...look.items, [slot]: c };
    const s = scoreLook(next, ctx);
    if (!best || s.exact > best.s.exact + 1e-9 || (Math.abs(s.exact - best.s.exact) <= 1e-9 && c.price < best.item.price)) best = { item: c, s, items: next };
  }
  if (!best) return { ok: false, reason: 'NO_ALTERNATIVE', message: `There is no other ${slot} in this catalog that fits your budget and choices.` };
  return { ok: true, look: finish({ items: best.items, s: best.s, total: priceOf(best.items) }, ctx, look.rank ?? 1) };
}

/** Rescores an existing look under the current profile and preferences. */
export function rescoreLook({ look, profile, prefs, constraints = {} }) {
  const ctx = buildContext({ profile, prefs, constraints });
  const total = priceOf(look.items);
  return finish({ items: look.items, s: scoreLook(look.items, ctx), total }, ctx, look.rank ?? 1, { withinBudget: total <= ctx.budget });
}

export { round };
