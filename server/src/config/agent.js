/**
 * Everything the agent layer decides with, in one place (Stage 7).
 *
 * The agent turns a typed request ("less formal, warmer lipstick") or a chip into a short list of validated operations.
 * The deterministic planner then acts on them. The language model never picks items, prices or scores: it only reads the
 * request into the schema below and, afterwards, rephrases facts the planner already produced (PRD section 9).
 */
import { COLOUR_FAMILIES } from './skin.js';

export const CHIPS = [
  { id: 'more_formal', label: 'More formal', ops: [{ op: 'change_formality', shift: 1 }] },
  { id: 'less_formal', label: 'Less formal', ops: [{ op: 'change_formality', shift: -1 }] },
  { id: 'warmer_lipstick', label: 'Warmer lipstick', ops: [{ op: 'change_lipstick', change: 'warmer' }] },
  { id: 'different_jewellery', label: 'Different jewellery', ops: [{ op: 'swap_item', slot: 'necklace' }, { op: 'swap_item', slot: 'earrings' }] },
  { id: 'cheaper', label: 'Cheaper', ops: [{ op: 'make_cheaper' }] },
  { id: 'change_colour_family', label: 'Change colour family', ops: [{ op: 'change_colour_family', families: [] }] },
];
export const CHIP_BY_ID = Object.fromEntries(CHIPS.map((c) => [c.id, c]));

export const EXAMPLES = ['Less formal, warmer lipstick', 'Swap the earrings', 'Gold jewellery only', 'Keep it under ₹15,000', 'Something in blue'];

export const SLOTS = ['outfit', 'necklace', 'earrings', 'lipstick'];
export const JEWELLERY_SLOTS = ['necklace', 'earrings'];
export const METAL_CHOICES = ['gold', 'silver', 'rose-gold'];
export const LIPSTICK_CHANGES = ['warmer', 'cooler', 'deeper', 'lighter', 'different'];
export const FAMILY_IDS = Object.keys(COLOUR_FAMILIES);

// Operation names the model may use. `unsupported` is how it says "this is not something the catalog can do".
export const OPS = ['swap_item', 'change_formality', 'change_colour_family', 'change_budget', 'exclude_item', 'remove_item', 'change_metal', 'change_lipstick', 'make_cheaper', 'unsupported'];

export const LIMITS = {
  messageMax: 300, // characters of a typed request
  opsPerTurn: 4,
  // PRD section 9: at most 6 tool calls and 3 renders per turn. Only the calls that search, change or rescore a look
  // count; reading the profile or the budget is free and still shows in the trace.
  toolCallsPerTurn: 6,
  rendersPerTurn: 3,
  llmCallsPerTurn: 2, // one to read the request, one to phrase the reply
  defaultSessionTurnCap: 40,
  defaultSessionLlmCap: 60,
  llmTimeoutMs: 12_000,
  replyMax: 480, // characters of a model-written reply
  alternatives: 3, // nearest alternatives offered for a request the catalog cannot meet
  traceKept: 200, // entries per session (memory only)
  traceTtlMs: 24 * 3_600_000,
  traceSessionsKept: 500,
};
export const COUNTED_TOOLS = new Set(['plan_looks', 'swap_item', 'score_look', 'render_look']);

// Colour words people use, mapped to the planner's colour families (config/skin.js).
export const COLOUR_WORDS = [
  [/\b(red|crimson|scarlet)\b/i, ['red', 'maroon']],
  [/\b(maroon|burgundy|wine)\b/i, ['maroon']],
  [/\b(pink|blush|rose)\b/i, ['blush', 'rose', 'magenta', 'berry']],
  [/\b(magenta|fuchsia|berry)\b/i, ['magenta', 'berry']],
  [/\b(blue|navy|royal blue|teal|turquoise)\b/i, ['navy', 'royal-blue', 'powder-blue', 'teal']],
  [/\b(green|emerald|olive|mint)\b/i, ['emerald', 'olive-green', 'mint']],
  [/\b(yellow|mustard|haldi)\b/i, ['mustard']],
  [/\b(orange|peach|coral|saffron)\b/i, ['peach', 'coral', 'saffron']],
  [/\b(purple|violet|plum|mauve|lilac|lavender)\b/i, ['plum', 'mauve', 'lilac']],
  [/\b(white|ivory|cream|off-white)\b/i, ['ivory']],
  [/\b(black)\b/i, ['black']],
  [/\b(brown|camel|beige|tan)\b/i, ['camel', 'brown']],
  [/\b(grey|gray)\b/i, ['grey']],
];

export const publicAgentConfig = ({ llm, caps }) => ({
  chips: CHIPS.map(({ id, label }) => ({ id, label })),
  examples: EXAMPLES,
  messageMax: LIMITS.messageMax,
  llm: { available: Boolean(llm?.available), note: llm?.available ? null : 'Typed requests use a simpler reader right now. The chips work exactly the same.' },
  caps,
  perTurn: { toolCalls: LIMITS.toolCallsPerTurn, renders: LIMITS.rendersPerTurn },
});
