export const SLOTS = ['outfit', 'earrings', 'lipstick', 'blush', 'foundation', 'eyewear', 'watch'];
export const SLOT_NOUN = { outfit: 'outfit', earrings: 'earrings', lipstick: 'lipstick', blush: 'blush', foundation: 'foundation', eyewear: 'eyewear', watch: 'watch' };
export const BUILD_KEY = 'ensemble.build';

/** Picks are { outfit, earrings, lipstick, eyewear, watch } of item ids (or undefined). Choosing the same item again removes it. */
export function togglePick(picks, item) {
  const next = { ...picks };
  if (next[item.type] === item.id) delete next[item.type];
  else next[item.type] = item.id;
  return next;
}

/** Removes a specific slot from picks. */
export function removePick(picks, slot) {
  const next = { ...picks };
  delete next[slot];
  return next;
}

/** Keeps only ids that still exist, at most one per kind. Anything else (an old link, a deleted item) is dropped quietly. */
export function cleanPicks(ids, items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = {};
  for (const id of ids ?? []) {
    const it = byId.get(id);
    if (it && SLOTS.includes(it.type) && !out[it.type]) out[it.type] = it.id;
  }
  return out;
}

export const pickedIds = (picks) => SLOTS.map((s) => picks[s]).filter(Boolean);

/** `?items=a,b,c` from a link on another page. */
export const idsFromSearch = (search) => (new URLSearchParams(search).get('items') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, SLOTS.length);

export const totalOf = (picks, byId) => pickedIds(picks).reduce((n, id) => n + (byId.get(id)?.price ?? 0), 0);

/** What the look would cost if `item` took the place of whatever is picked for its kind. */
export function totalWith(picks, item, byId) {
  return totalOf({ ...picks, [item.type]: item.id }, byId);
}

export function readPicks() {
  try { return JSON.parse(sessionStorage.getItem(BUILD_KEY) || '[]'); } catch { return []; }
}
export function writePicks(picks) {
  try { sessionStorage.setItem(BUILD_KEY, JSON.stringify(pickedIds(picks))); } catch { /* storage can be blocked */ }
}

/** Up to how many units drawing these kinds could cost, from the render config. */
export const maxUnits = (config, picks) => (config ? config.stages.filter((s) => picks[s.id]).reduce((n, s) => n + s.units, 0) : null);
