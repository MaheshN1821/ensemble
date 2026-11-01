import { AppError } from '../../lib/errors.js';
import { BUDGET } from '../../config/intake.js';
import { effectiveProfile } from '../skin/profile.js';
import { rescoreLook } from '../planner/plan.js';
import { createHash } from 'node:crypto';

const SLOTS = ['outfit', 'earrings', 'eyewear', 'lipstick', 'blush', 'foundation', 'watch'];
const accessoryLook = (items, budgetInr) => {
  const totalPrice = Object.values(items).reduce((sum, item) => sum + (item.price ?? 0), 0);
  const id = `look_${createHash('sha1').update(Object.entries(items).map(([slot, item]) => `${slot}:${item.id}`).sort().join('|')).digest('hex').slice(0, 10)}`;
  return {
    id, items, itemIds: Object.values(items).map((item) => item.id), totalPrice,
    withinBudget: totalPrice <= budgetInr, overBy: Math.max(0, totalPrice - budgetInr),
    score: 0, components: {}, rules: [], reasons: [], cautions: [],
  };
};

/**
 * "Build your own look": the shopper picks the pieces, we only check and score them. Nothing here spends a YouCam unit
 * or calls a language model. Drawing the chosen look goes through the same POST /api/sessions/me/looks as every other
 * look, so caching, caps, retries and sharing behave exactly as they do for planned looks.
 */
export function createBuilderService({ catalogs, skin }) {
  function gate(session) {
    if (!session.consent?.over18) throw new AppError('CONSENT_REQUIRED', 'Confirm the consent screen first.', 403);
    if (!session.preferences) throw new AppError('PREFERENCES_REQUIRED', 'Add your occasion and budget first, then you can build a look.', 409);
    const stored = skin.current(session);
    if (!stored) throw new AppError('NO_PROFILE', 'Read your skin tone first, then you can build a look to match it.', 409);
    return stored;
  }

  /** The items this session can pick from: the same scope the planner uses (one retailer's store, or everyone), minus items the shopper said never to show. */
  async function pickable(session) {
    const { catalog, items, fellBack } = await catalogs.itemsForSession(session);
    const hidden = new Set(session.agent?.excludeItemIds ?? []);
    const list = items.filter((i) => SLOTS.includes(i.type) && !hidden.has(i.id));
    const counts = Object.fromEntries(SLOTS.map((s) => [s, list.filter((i) => i.type === s).length]));
    return { catalog: { id: catalog.id, name: catalog.name, itemCount: list.length, counts, fellBack }, items: list };
  }

  return {
    async itemsForSession(session) {
      gate(session);
      const { catalog, items } = await pickable(session);
      return {
        catalog,
        items,
        budgetInr: session.preferences.budgetInr,
        budget: { min: BUDGET.min, max: BUDGET.max, step: BUDGET.step },
      };
    },

    /** Scores a chosen set without drawing it. Over budget is a normal answer here (withinBudget: false), so the screen can say by how much. */
    async preview(session, { itemIds, budgetInr } = {}) {
      const stored = gate(session);
      if (!Array.isArray(itemIds) || itemIds.length < 1 || itemIds.length > SLOTS.length || itemIds.some((x) => typeof x !== 'string' || x.length > 80)) {
        throw new AppError('INVALID_INPUT', 'Send the ids of the items you picked (an outfit, and optional accessories and makeup).', 400, { field: 'itemIds' });
      }
      if (budgetInr !== undefined && budgetInr !== null && (!Number.isInteger(budgetInr) || budgetInr < BUDGET.min || budgetInr > BUDGET.max)) {
        throw new AppError('INVALID_INPUT', `Choose a budget between ₹${BUDGET.min.toLocaleString('en-IN')} and ₹${BUDGET.max.toLocaleString('en-IN')}.`, 400, { field: 'budgetInr' });
      }
      const { items } = await pickable(session);
      const byId = new Map(items.map((i) => [i.id, i]));
      const chosen = {};
      for (const id of new Set(itemIds)) {
        const item = byId.get(id);
        if (!item) throw new AppError('ITEM_NOT_FOUND', 'One of the items you picked is no longer available. Pick it again.', 409, { itemId: id });
        if (chosen[item.type]) throw new AppError('INVALID_INPUT', 'A look has at most one item of each kind.', 400, { field: 'itemIds' });
        chosen[item.type] = item;
      }
      const budget = budgetInr ?? session.preferences.budgetInr;
      const look = chosen.outfit
        ? rescoreLook({ look: { items: chosen }, profile: effectiveProfile(stored), prefs: session.preferences, constraints: budgetInr ? { budgetInr } : {} })
        : accessoryLook(chosen, budget);
      return { look };
    },
  };
}
