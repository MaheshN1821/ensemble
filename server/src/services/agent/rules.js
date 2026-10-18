import { BUDGET } from '../../config/intake.js';
import { CHIP_BY_ID, COLOUR_WORDS } from '../../config/agent.js';

/**
 * The keyword reader. It is the fallback when no language model is set up, when the model is unavailable, or when the
 * session's model allowance is spent (FR-28). It understands the same operations as the model path, just fewer phrasings.
 * Chips never need it: a chip is already a list of operations.
 */

const num = (s) => Number(String(s).replace(/[,\s]/g, ''));

/** "15k", "₹15,000", "rs 15000", "1.5 lakh" -> rupees, or null. */
export function parseMoney(text) {
  const m = String(text).match(/(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakh|lac|l)?\b/i);
  if (!m) return null;
  let n = num(m[1]);
  const unit = (m[2] ?? '').toLowerCase();
  if (unit === 'k' || unit === 'thousand') n *= 1000;
  else if (unit === 'lakh' || unit === 'lac' || unit === 'l') n *= 100000;
  return Number.isFinite(n) ? Math.round(n) : null;
}

const SLOT_WORDS = [
  [/\b(necklace|choker|pendant|chain)\b/i, 'necklace'],
  [/\b(earrings?|jhumkas?|studs?|hoops?)\b/i, 'earrings'],
  [/\b(lipsticks?|lip\s*colou?r|lip\s*shade|lips)\b/i, 'lipstick'],
  [/\b(outfit|dress|saree|sari|lehenga|kurta|gown|blazer|clothes|garment)\b/i, 'outfit'],
];
const slotIn = (text) => SLOT_WORDS.find(([re]) => re.test(text))?.[1] ?? null;
// Things a person says about the garment itself, which a catalog cannot change.
const GARMENT_EDIT = /\b(longer|shorter|tighter|looser|sleeve|sleeves|neckline|hem|length|fit|alter|resize|stitch|embroider\w*|add pockets?|change the (cut|pattern|print|fabric))\b/i;

/** @returns {{ ops: object[], notes: string[] }} */
export function readRequest(message) {
  const text = String(message ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const ops = [];
  const notes = [];
  if (!text) return { ops: [{ op: 'unsupported', reason: 'empty request' }], notes };

  // Budget: "under 15k", "budget of 20000", "keep it below ₹18,000". Only when a budget word is near the number.
  if (/\b(budget|under|below|within|less than|max(imum)?|at most|upto|up to|not more than|cap)\b/.test(text) && !/\b(percent|%)\b/.test(text)) {
    const money = parseMoney(text.replace(/^.*?\b(?:budget|under|below|within|less than|maximum|max|at most|upto|up to|not more than|cap)\b(?: of| to| at)?/, ''));
    if (money && money >= BUDGET.min && money <= BUDGET.max) ops.push({ op: 'change_budget', budgetInr: money });
    else if (money) notes.push(`A budget has to be between ₹${BUDGET.min.toLocaleString('en-IN')} and ₹${BUDGET.max.toLocaleString('en-IN')}.`);
  }

  if (/\b(less formal|more casual|casual(?:ly)?|dress(?:ed)? down|toned? down|simpler|relaxed|not (?:so|that) formal|lighter outfit)\b/.test(text)) ops.push({ op: 'change_formality', shift: /\b(a lot|much|way) (?:less|more)|\bvery casual\b/.test(text) ? -2 : -1 });
  else if (/\b(more formal|formal(?:ly)?|dress(?:ed)? up|dressier|fancier|grander|more elegant|more traditional)\b/.test(text) && !/\bnot formal\b/.test(text)) ops.push({ op: 'change_formality', shift: /\b(a lot|much|way) more\b|\bvery formal\b/.test(text) ? 2 : 1 });

  // Lipstick direction.
  const lip = /\b(lip|lips|lipstick|lipsticks|shade)\b/.test(text);
  if (lip) {
    if (/\bwarm(?:er)?\b/.test(text)) ops.push({ op: 'change_lipstick', change: 'warmer' });
    else if (/\bcool(?:er)?\b/.test(text)) ops.push({ op: 'change_lipstick', change: 'cooler' });
    else if (/\b(deep(?:er)?|dark(?:er)?|bolder)\b/.test(text)) ops.push({ op: 'change_lipstick', change: 'deeper' });
    else if (/\b(light(?:er)?|soft(?:er)?|nude|subtle|natural)\b/.test(text)) ops.push({ op: 'change_lipstick', change: 'lighter' });
    else if (/\b(different|another|change|other|swap|switch)\b/.test(text)) ops.push({ op: 'change_lipstick', change: 'different' });
  }

  // Metal. "gold" or "silver" on its own is a metal unless it describes the garment.
  const metalMatch = text.match(/\b(rose[ -]?gold|gold(?:en)?|silver)\b(?!\s*(?:dress|saree|sari|lehenga|kurta|gown|outfit|colou?r|border|zari))/);
  if (metalMatch && /\b(jewell?ery|necklace|earrings?|metal|tone|accessor\w+|only|instead|prefer|switch|change|use|go)\b/.test(text)) {
    const w = metalMatch[1];
    ops.push({ op: 'change_metal', metal: /rose/.test(w) ? 'rose-gold' : /silver/.test(w) ? 'silver' : 'gold' });
  }

  // Remove, exclude, swap, add.
  const target = slotIn(text);
  const jewelleryWord = /\bjewell?ery\b/.test(text);
  if (/\b(without|remove|drop|skip|no)\b\s+(?:the |any |a )?(?:necklace|choker|pendant|chain|earrings?|jhumkas?|studs?|hoops?)\b/.test(text) && (target === 'necklace' || target === 'earrings')) {
    ops.push({ op: 'remove_item', slot: target });
  } else if (/\b(don'?t like|do not like|hate|dislike|exclude|never show|not (?:these|this|that)|nothing like)\b/.test(text) && (target || jewelleryWord)) {
    if (target) ops.push({ op: 'exclude_item', slot: target });
    else { ops.push({ op: 'exclude_item', slot: 'necklace' }); ops.push({ op: 'exclude_item', slot: 'earrings' }); }
  } else if (/\b(swap|switch|replace|change|different|another|other|add|try|show me)\b/.test(text) && !ops.some((o) => o.op === 'change_lipstick')) {
    if (target && !(target === 'outfit' && GARMENT_EDIT.test(text))) ops.push({ op: 'swap_item', slot: target });
    else if (jewelleryWord) { ops.push({ op: 'swap_item', slot: 'necklace' }); ops.push({ op: 'swap_item', slot: 'earrings' }); }
    else if (/\b(something else|different look|another look|another option)\b/.test(text)) ops.push({ op: 'swap_item', slot: 'outfit' });
  }

  if (/\b(cheaper|cheap|less expensive|lower (?:the )?price|save (?:some )?money|economical|affordable|inexpensive|pocket friendly)\b/.test(text) && !ops.some((o) => o.op === 'change_budget')) ops.push({ op: 'make_cheaper' });

  // Colours of the outfit. "no black" / "avoid red" are colour exclusions the planner already honours through intake,
  // so only positive asks are read here ("something in blue", "try green", "different colour").
  if (!ops.some((o) => o.op === 'swap_item' && o.slot === 'outfit')) {
    const negative = /\b(no|not|avoid|without|except|anything but)\s+(?:any\s+)?(?:red|pink|blue|green|yellow|orange|black|white|purple)\b/.test(text);
    const families = [];
    // A metal already read above ("rose gold jewellery") must not be read again as a colour.
    const colourText = ops.some((o) => o.op === 'change_metal') && metalMatch ? text.replace(metalMatch[0], ' ') : text;
    if (!negative && !lip) for (const [re, fams] of COLOUR_WORDS) if (re.test(colourText)) for (const f of fams) if (!families.includes(f)) families.push(f);
    if (families.length) ops.push({ op: 'change_colour_family', families: families.slice(0, 8) });
    else if (/\b(different|another|new|change)\s+colou?r(?:s| family)?\b/.test(text)) ops.push({ op: 'change_colour_family', families: [] });
    else if (negative) notes.push('Colours you want to avoid are set on the intake screen, and every look already respects them. Change them there.');
  }

  if (!ops.length) {
    const alt = GARMENT_EDIT.test(text) ? 'outfit' : slotIn(text);
    ops.push({ op: 'unsupported', reason: GARMENT_EDIT.test(text) ? 'edit the garment itself' : 'not something the catalog can change', slot: alt });
  }
  return { ops, notes };
}

export const opsForChip = (chipId) => (CHIP_BY_ID[chipId] ? structuredClone(CHIP_BY_ID[chipId].ops) : null);
