export const SLOTS = ['outfit', 'earrings', 'lipstick', 'eyewear', 'watch'];
export const MAX_COMPARE = 2;

/**
 * Side-by-side view of two looks (FR-25). Pure, so it can be tested without a browser.
 * Each row says whether the two looks share that item, in words as well as data: nothing relies on colour.
 */
export function compareLooks(a, b) {
  const rows = SLOTS.map((slot) => {
    const x = a.items?.[slot] ?? null;
    const y = b.items?.[slot] ?? null;
    return { slot, a: x, b: y, same: (x?.id ?? null) === (y?.id ?? null), onlyIn: !x && y ? 'b' : x && !y ? 'a' : null };
  });
  const differing = rows.filter((r) => !r.same).length;
  const priceDiff = (b.totalPrice ?? 0) - (a.totalPrice ?? 0);
  const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
  const has = (list, text) => (list ?? []).includes(text);
  return {
    rows,
    differing,
    priceDiff,
    scoreDiff,
    reasons: {
      shared: (a.reasons ?? []).filter((r) => has(b.reasons, r)),
      onlyA: (a.reasons ?? []).filter((r) => !has(b.reasons, r)),
      onlyB: (b.reasons ?? []).filter((r) => !has(a.reasons, r)),
    },
    summary: summarise({ differing, priceDiff, scoreDiff }),
  };
}

const money = (n) => `₹${Math.abs(n).toLocaleString('en-IN')}`;

function summarise({ differing, priceDiff, scoreDiff }) {
  if (differing === 0) return 'These two looks use the same items.';
  const items = `${differing} ${differing === 1 ? 'item differs' : 'items differ'}`;
  const price = priceDiff === 0 ? 'The total is the same' : `Look B costs ${money(priceDiff)} ${priceDiff > 0 ? 'more' : 'less'}`;
  const score = scoreDiff === 0 ? 'the match score is the same' : `its match score is ${Math.abs(scoreDiff)} ${Math.abs(scoreDiff) === 1 ? 'point' : 'points'} ${scoreDiff > 0 ? 'higher' : 'lower'}`;
  return `${items}. ${price}, and ${score}.`;
}

/** Adds or removes an id from a selection of at most two. Selecting a third drops the oldest. */
export function toggleSelection(selected, id) {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return [...selected, id].slice(-MAX_COMPARE);
}

const LOOK_ID = /^look_[a-f0-9]{10}$/;
/** Reads ?a= and ?b= safely. Anything that is not a look id is ignored. */
export function pairFromParams(params) {
  const pick = (k) => { const v = params.get(k); return v && LOOK_ID.test(v) ? v : null; };
  const a = pick('a');
  const b = pick('b');
  return { a, b: b && b !== a ? b : null };
}
