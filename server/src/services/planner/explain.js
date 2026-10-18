const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const ORDER = { colour: 0, occasion: 1, palette: 2, metal: 3, preferences: 4 };

/**
 * Plain-language explanation built only from the rules that fired for this look. Nothing here is invented, and it
 * only mentions item ids that are in the look. The language model (Stage 7) may rephrase this, never extend it.
 */
export function explainLook(look, ctx) {
  const rules = [...look.rules].sort((a, b) => ORDER[a.component] - ORDER[b.component]);
  const seen = new Set();
  const uniq = rules.filter((r) => (seen.has(r.text) ? false : seen.add(r.text)));
  const positives = uniq.filter((r) => r.kind === 'positive').slice(0, 5).map((r) => r.text);
  const cautions = uniq.filter((r) => r.kind === 'caution').slice(0, 3).map((r) => r.text);
  const names = Object.values(look.items).map((i) => i.name);
  const budgetPart = look.withinBudget
    ? `${money(look.totalPrice)} in total, ${money(ctx.budget - look.totalPrice)} under your ${money(ctx.budget)} budget.`
    : `${money(look.totalPrice)} in total, ${money(look.overBy)} over your ${money(ctx.budget)} budget.`;
  return {
    summary: `${names.join(', ')}. ${budgetPart}`,
    reasons: positives,
    cautions,
    ruleCodes: uniq.map((r) => r.code),
  };
}
