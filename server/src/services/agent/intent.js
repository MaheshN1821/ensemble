import { z } from 'zod';
import { BUDGET } from '../../config/intake.js';
import { FAMILY_IDS, JEWELLERY_SLOTS, LIMITS, LIPSTICK_CHANGES, METAL_CHOICES, OPS, SLOTS } from '../../config/agent.js';

const slot = z.enum(SLOTS);
const id = z.string().trim().min(1).max(80);

/** One operation the shopper can ask for (FR-23). Validated, so nothing the model says can reach the planner unchecked. */
export const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('swap_item'), slot, itemId: id.optional() }),
  z.object({ op: z.literal('change_formality'), shift: z.number().int().min(-2).max(2) }),
  z.object({ op: z.literal('change_colour_family'), families: z.array(z.enum(FAMILY_IDS)).max(8).default([]) }),
  z.object({ op: z.literal('change_budget'), budgetInr: z.number().int().min(BUDGET.min).max(BUDGET.max) }),
  z.object({ op: z.literal('exclude_item'), slot: slot.optional(), itemId: id.optional() }),
  z.object({ op: z.literal('remove_item'), slot: z.enum(JEWELLERY_SLOTS) }),
  z.object({ op: z.literal('change_metal'), metal: z.enum(METAL_CHOICES) }),
  z.object({ op: z.literal('change_lipstick'), change: z.enum(LIPSTICK_CHANGES) }),
  z.object({ op: z.literal('make_cheaper') }),
  z.object({ op: z.literal('unsupported'), reason: z.string().trim().max(200).optional(), slot: slot.optional() }),
]);

/**
 * Validates a list of raw operations (from the model, a chip, or the keyword reader).
 * Returns { ops, rejected } so one bad operation does not throw away the good ones.
 */
export function validateOps(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const ops = [];
  const rejected = [];
  for (const item of list.slice(0, LIMITS.opsPerTurn + 4)) {
    const parsed = opSchema.safeParse(item);
    if (!parsed.success) { rejected.push({ op: String(item?.op ?? '?').slice(0, 40), problem: parsed.error.issues[0]?.message ?? 'invalid' }); continue; }
    if (parsed.data.op === 'change_formality' && parsed.data.shift === 0) { rejected.push({ op: 'change_formality', problem: 'shift must not be zero' }); continue; }
    if (parsed.data.op === 'exclude_item' && !parsed.data.slot && !parsed.data.itemId) { rejected.push({ op: 'exclude_item', problem: 'say which item to exclude' }); continue; }
    ops.push(parsed.data);
  }
  const trimmed = ops.slice(0, LIMITS.opsPerTurn);
  if (ops.length > trimmed.length) rejected.push({ op: 'extra', problem: `Only the first ${LIMITS.opsPerTurn} requests are used in one turn.` });
  return { ops: trimmed, rejected };
}

/**
 * JSON schema given to the model as the one tool it may call. Kept flat (no oneOf) so both providers accept it; the
 * zod schema above is what actually enforces the shape.
 */
export const INTENT_TOOL = {
  name: 'apply_refinement',
  description: 'Record what the shopper wants changed about the current look. Use one entry per change. Use "unsupported" for anything the catalog cannot do, such as editing a garment itself.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      operations: {
        type: 'array',
        maxItems: LIMITS.opsPerTurn,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            op: { type: 'string', enum: OPS },
            slot: { type: 'string', enum: SLOTS, description: 'For swap_item, exclude_item, remove_item (remove only for necklace or earrings).' },
            itemId: { type: 'string', description: 'Only an id from the current look or the list you were given.' },
            shift: { type: 'integer', minimum: -2, maximum: 2, description: 'For change_formality: -1 less formal, 1 more formal.' },
            families: { type: 'array', items: { type: 'string', enum: FAMILY_IDS }, description: 'For change_colour_family. Empty means "a different colour family".' },
            budgetInr: { type: 'integer', description: 'For change_budget, in rupees.' },
            metal: { type: 'string', enum: METAL_CHOICES, description: 'For change_metal.' },
            change: { type: 'string', enum: LIPSTICK_CHANGES, description: 'For change_lipstick.' },
            reason: { type: 'string', description: 'For unsupported: what was asked, in a few words.' },
          },
          required: ['op'],
        },
      },
    },
    required: ['operations'],
  },
};

export const REPLY_TOOL = {
  name: 'write_reply',
  description: 'Write the short reply to the shopper using only the facts provided.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reply: { type: 'string', description: 'Two or three plain sentences.' },
      mentionedItemIds: { type: 'array', items: { type: 'string' }, description: 'Ids of every item you named in the reply.' },
    },
    required: ['reply', 'mentionedItemIds'],
  },
};

export const replySchema = z.object({ reply: z.string().trim().min(1).max(2000), mentionedItemIds: z.array(z.string().max(80)).max(12).default([]) });
export const intentSchema = z.object({ operations: z.array(z.unknown()).max(12) });

export const summariseOp = (o) => {
  switch (o.op) {
    case 'swap_item': return `swap ${o.slot}${o.itemId ? ` for ${o.itemId}` : ''}`;
    case 'change_formality': return o.shift < 0 ? 'less formal' : 'more formal';
    case 'change_colour_family': return o.families?.length ? `colour: ${o.families.join(', ')}` : 'different colour family';
    case 'change_budget': return `budget ₹${o.budgetInr}`;
    case 'exclude_item': return `exclude ${o.itemId ?? o.slot}`;
    case 'remove_item': return `remove ${o.slot}`;
    case 'change_metal': return `metal ${o.metal}`;
    case 'change_lipstick': return `lipstick ${o.change}`;
    case 'make_cheaper': return 'cheaper';
    default: return 'unsupported';
  }
};
