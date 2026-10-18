import { BUDGET } from '../../config/intake.js';
import { JEWELLERY_SLOTS, LIMITS } from '../../config/agent.js';
import { hexToLab } from '../skin/classify.js';
import { primaryColour, SLOTS } from '../planner/score.js';
import { swapItem } from '../planner/plan.js';

const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const NOUN = { outfit: 'outfit', necklace: 'necklace', earrings: 'earrings', lipstick: 'lipstick' };
const priceOf = (items) => Object.values(items).reduce((s, i) => s + (i?.price ?? 0), 0);
const idsOf = (items) => Object.values(items).filter(Boolean).map((i) => i.id).sort().join('|');

/** Thrown when a turn would use more than its allowance of tool calls. The turn stops and says so. */
export class TurnCapError extends Error {
  constructor() { super('tool call cap reached'); this.code = 'TURN_TOOL_CAP'; }
}

const lipLab = (item) => { const hex = primaryColour(item)?.hex; return hex ? hexToLab(hex) : null; };
const hueDeg = (l) => (Math.atan2(l.b, l.a) * 180) / Math.PI;

/** For "warmer / cooler / deeper / lighter": a filter over lipsticks, compared with the current shade. */
function lipFilter(change, current) {
  const base = current ? lipLab(current) : null;
  if (change === 'different' || !base) return (i) => i.id !== current?.id;
  const h0 = hueDeg(base);
  return (i) => {
    const l = lipLab(i);
    if (!l || i.id === current.id) return false;
    if (change === 'warmer') return hueDeg(l) > h0 + 2;
    if (change === 'cooler') return hueDeg(l) < h0 - 2;
    if (change === 'deeper') return l.L < base.L - 3;
    return l.L > base.L + 3; // lighter
  };
}

const familiesOf = (item) => (item?.colours ?? []).filter((c) => c.share >= 0.25).map((c) => c.family);

/**
 * Applies a list of validated operations to the current look. Pure apart from the `tool` wrapper the caller passes in:
 * `tool(name, summary, fn)` runs `fn`, records it in the trace and counts it against the turn's allowance.
 *
 * Nothing here chooses items by itself. Every change goes through the planner's own `swapItem`, so the budget stays a
 * hard limit and every pick is scored by the same rules as the original look.
 *
 * @returns {{ items, changes[], failures[], unsupported[], prefsPatch, excludeAdd[], skipped[] }}
 */
export function applyOperations({ ops, catalogItems, lookItems, profile, prefs, excluded = [], tool }) {
  const byId = new Map(catalogItems.map((i) => [i.id, i]));
  let cur = { ...lookItems };
  let budget = prefs.budgetInr;
  let metal = prefs.metal && prefs.metal !== 'any' ? prefs.metal : null;
  const excludedIds = new Set(excluded);
  const changes = [];
  const failures = [];
  const unsupported = [];
  const skipped = [];
  const prefsPatch = {};
  const excludeAdd = [];

  const effPrefs = () => ({ ...prefs, budgetInr: budget, metal: metal ?? 'any' });
  const record = (op, slot, from, to) => changes.push({ op, slot, from: from ? brief(from) : null, to: to ? brief(to) : null });
  const fail = (op, message, extra = {}) => failures.push({ op, message, ...extra });

  /** One planner swap through the tool wrapper. Returns the new item, or { error } with the planner's own reason. */
  function swap(slot, { filter = null, constraints = {}, summary = `swap ${slot}` } = {}) {
    const out = tool('swap_item', summary, () => swapItem({
      look: { items: cur, rank: 1 }, slot, items: catalogItems, profile, prefs: effPrefs(),
      constraints: { excludeItemIds: [...excludedIds], ...constraints }, filter,
    }), (o) => (o.ok ? `${slot}: ${o.look.items[slot]?.name} (score ${o.look.score}, ${money(o.look.totalPrice)})` : o.message));
    if (!out.ok) return { error: out };
    return { item: out.look.items[slot], items: out.look.items };
  }

  const nothingFits = (slot, what) => `There is no ${what ? `${what} ` : 'other '}${NOUN[slot]} in this catalog that fits your budget and choices.`;

  for (let n = 0; n < ops.length; n++) {
    const op = ops[n];
    try {
      switch (op.op) {
        case 'swap_item': {
          const before = cur[op.slot];
          if (op.itemId) {
            const item = byId.get(op.itemId);
            if (!item || item.type !== op.slot) { fail(op, 'That item is not in this catalog.'); break; }
            if (excludedIds.has(item.id)) { fail(op, `You asked not to see ${item.name}, so it was not used.`); break; }
            const total = priceOf({ ...cur, [op.slot]: item });
            if (total > budget) { fail(op, `${item.name} would bring the look to ${money(total)}, which is over your ${money(budget)} budget.`); break; }
            tool('swap_item', `${op.slot} → ${item.id}`, () => true);
            cur = { ...cur, [op.slot]: item };
            if (before?.id !== item.id) record(op, op.slot, before, item);
            break;
          }
          const r = swap(op.slot);
          if (r.error) { fail(op, r.error.message ?? nothingFits(op.slot)); break; }
          cur = r.items;
          record(op, op.slot, before, r.item);
          break;
        }

        case 'change_formality': {
          const base = cur.outfit?.formality;
          const filter = (o) => (op.shift < 0 ? o.formality < base : o.formality > base);
          const r = swap('outfit', { filter, constraints: { formalityShift: op.shift }, summary: op.shift < 0 ? 'outfit, less formal' : 'outfit, more formal' });
          if (r.error) { fail(op, nothingFits('outfit', op.shift < 0 ? 'less formal' : 'more formal')); break; }
          const before = cur.outfit; cur = r.items; record(op, 'outfit', before, r.item);
          break;
        }

        case 'change_colour_family': {
          const had = familiesOf(cur.outfit);
          const wanted = op.families ?? [];
          const filter = wanted.length ? (o) => familiesOf(o).some((f) => wanted.includes(f)) : (o) => !familiesOf(o).some((f) => had.includes(f));
          const r = swap('outfit', { filter, constraints: wanted.length ? { preferFamilies: wanted } : {}, summary: wanted.length ? `outfit in ${wanted.slice(0, 3).join('/')}` : 'outfit, other colour family' });
          if (r.error) { fail(op, wanted.length ? 'No outfit in that colour fits this occasion and your budget.' : nothingFits('outfit', 'different-coloured'), { slot: 'outfit' }); break; }
          const before = cur.outfit; cur = r.items; record(op, 'outfit', before, r.item);
          break;
        }

        case 'change_budget': {
          const target = op.budgetInr;
          if (target < BUDGET.min || target > BUDGET.max) { fail(op, `Choose a budget between ${money(BUDGET.min)} and ${money(BUDGET.max)}.`); break; }
          // Lowering the budget below the current look means swapping to cheaper pieces until it fits, or not changing the budget.
          const saved = { cur, changes: changes.length, budget };
          let ok = priceOf(cur) <= target;
          let guard = 0;
          budget = target;
          while (!ok && guard++ < 4) {
            const slots = SLOTS.filter((s) => cur[s]).sort((a, b) => cur[b].price - cur[a].price);
            let moved = false;
            for (const slot of slots) {
              const r = swap(slot, { filter: (i) => i.price < cur[slot].price, summary: `${slot}, cheaper for the new budget` });
              if (r.error) continue;
              const before = cur[slot]; cur = r.items; record(op, slot, before, r.item); moved = true; break;
            }
            if (!moved) break;
            ok = priceOf(cur) <= target;
          }
          if (!ok) {
            const cheapest = priceOf(cur);
            cur = saved.cur; changes.length = saved.changes; budget = saved.budget;
            fail(op, `Nothing in this catalog brings this look under ${money(target)}. The cheapest version of it is about ${money(cheapest)}.`);
            break;
          }
          prefsPatch.budgetInr = target;
          break;
        }

        case 'exclude_item': {
          const hit = op.itemId ? Object.values(cur).find((i) => i?.id === op.itemId) ?? byId.get(op.itemId) : cur[op.slot];
          if (!hit) { fail(op, `This look has no ${NOUN[op.slot] ?? 'item'} to exclude.`); break; }
          excludedIds.add(hit.id); excludeAdd.push(hit.id);
          const inLook = Object.entries(cur).find(([, i]) => i?.id === hit.id);
          if (!inLook) { changes.push({ op, slot: hit.type, from: brief(hit), to: null, note: `${hit.name} will not be shown again.` }); break; }
          const slot = inLook[0];
          const r = swap(slot, { summary: `${slot}, replace excluded` });
          if (!r.error) { const before = cur[slot]; cur = r.items; record(op, slot, before, r.item); break; }
          if (JEWELLERY_SLOTS.includes(slot)) { const before = cur[slot]; const { [slot]: _gone, ...rest } = cur; cur = rest; record(op, slot, before, null); break; }
          fail(op, `${hit.name} is excluded from now on, but there is no other ${NOUN[slot]} that fits your budget and choices, so it stays in this look.`, { slot });
          break;
        }

        case 'remove_item': {
          if (!cur[op.slot]) { fail(op, `This look has no ${NOUN[op.slot]} to remove.`); break; }
          const before = cur[op.slot];
          const { [op.slot]: _gone, ...rest } = cur;
          tool('swap_item', `remove ${op.slot}`, () => true);
          cur = rest; record(op, op.slot, before, null);
          break;
        }

        case 'change_metal': {
          metal = op.metal; prefsPatch.metal = op.metal;
          const slots = JEWELLERY_SLOTS.filter((s) => cur[s] && cur[s].metalTone !== op.metal);
          let any = false;
          for (const slot of slots) {
            const r = swap(slot, { constraints: { forceMetal: op.metal }, summary: `${slot}, ${op.metal.replace('-', ' ')}` });
            if (r.error) { fail(op, `This catalog has no ${op.metal.replace('-', ' ')} ${NOUN[slot]} that fits your budget, so the ${NOUN[slot]} stays as it is.`, { slot }); continue; }
            const before = cur[slot]; cur = r.items; record(op, slot, before, r.item); any = true;
          }
          if (!slots.length && !any) changes.push({ op, slot: null, from: null, to: null, note: `Jewellery stays ${op.metal.replace('-', ' ')}.` });
          break;
        }

        case 'change_lipstick': {
          const r = swap('lipstick', { filter: lipFilter(op.change, cur.lipstick), summary: `lipstick, ${op.change}` });
          if (r.error) { fail(op, nothingFits('lipstick', op.change === 'different' ? 'other' : op.change)); break; }
          const before = cur.lipstick; cur = r.items; record(op, 'lipstick', before, r.item);
          break;
        }

        case 'make_cheaper': {
          const slots = SLOTS.filter((s) => cur[s]).sort((a, b) => cur[b].price - cur[a].price);
          let done = false;
          for (const slot of slots) {
            const r = swap(slot, { filter: (i) => i.price < cur[slot].price, summary: `${slot}, cheaper` });
            if (r.error) continue;
            const before = cur[slot]; cur = r.items; record(op, slot, before, r.item); done = true; break;
          }
          if (!done) fail(op, 'Every piece in this look is already the cheapest that suits your choices.');
          break;
        }

        case 'unsupported':
          unsupported.push({ reason: op.reason ?? 'not something the catalog can change', slot: op.slot ?? null });
          break;

        default:
          fail(op, 'That request is not one I can act on.');
      }
    } catch (err) {
      if (err instanceof TurnCapError) { skipped.push(...ops.slice(n).map((o) => o.op)); break; }
      throw err;
    }
  }

  return { items: cur, changes, failures, unsupported, prefsPatch, excludeAdd, skipped, budget, metal, changed: idsOf(cur) !== idsOf(lookItems) };
}

export const brief = (i) => ({ id: i.id, name: i.name, price: i.price, type: i.type });

/**
 * The nearest alternatives for something the catalog cannot do: the best other items for a slot, found by asking the
 * planner for a swap repeatedly while excluding what it already returned.
 */
export function nearestAlternatives({ slot, lookItems, catalogItems, profile, prefs, excluded = [], count = LIMITS.alternatives, tool }) {
  const out = [];
  const skip = new Set(excluded);
  let cur = { ...lookItems };
  for (let i = 0; i < count; i++) {
    const r = tool('swap_item', `alternative ${slot} ${i + 1}`, () => swapItem({ look: { items: cur, rank: 1 }, slot, items: catalogItems, profile, prefs, constraints: { excludeItemIds: [...skip] } }), (o) => (o.ok ? `${o.look.items[slot]?.name}` : o.message));
    if (!r.ok) break;
    const item = r.look.items[slot];
    out.push({ slot, itemId: item.id, name: item.name, price: item.price, score: r.look.score });
    skip.add(item.id);
    cur = { ...lookItems }; // each alternative is measured against the look the shopper has, not against the previous alternative
  }
  return out;
}

