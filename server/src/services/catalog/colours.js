import { COLOUR_FAMILIES } from '../../config/skin.js';
import { COLOUR_RULES } from '../../config/catalog.js';
import { hexToLab, normaliseHex, rgbToHex } from '../skin/classify.js';

const FAMILY_LAB = Object.entries(COLOUR_FAMILIES).map(([id, f]) => ({ id, lab: hexToLab(f.hex) }));

export const deltaE = (p, q) => Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
const chromaOf = (lab) => Math.hypot(lab.a, lab.b);

/** Nearest colour family by CIELAB distance. Pure greys land on grey, so a charcoal sari is not read as navy. */
export function familyOf(hex) {
  const lab = hexToLab(hex);
  if (chromaOf(lab) < 9 && lab.L > 25 && lab.L < 80) return 'grey';
  let best = FAMILY_LAB[0];
  let bestD = Infinity;
  for (const f of FAMILY_LAB) {
    const d = deltaE(lab, f.lab);
    if (d < bestD) { best = f; bestD = d; }
  }
  return best.id;
}

export const isBackgroundLike = (hex) => {
  const lab = hexToLab(hex);
  return lab.L >= COLOUR_RULES.backgroundMinLightness && chromaOf(lab) <= COLOUR_RULES.backgroundMaxChroma;
};

/**
 * Turns raw (hex, weight) pairs into the colours stored on an item: background-like colours removed (unless that is all
 * there is), nearby colours merged by family, shares normalised, noise dropped, at most `keep` colours.
 * Returns [{ hex, family, share }] sorted by share. `share` sums to 1.
 */
export function finaliseColours(raw, { dropBackground = true } = {}) {
  const valid = raw
    .map((c) => ({ hex: normaliseHex(c.hex), weight: Number(c.weight) }))
    .filter((c) => c.hex && Number.isFinite(c.weight) && c.weight > 0);
  if (!valid.length) return [];

  let pool = valid;
  if (dropBackground) {
    const kept = valid.filter((c) => !isBackgroundLike(c.hex));
    if (kept.length) pool = kept;
  }

  const byFamily = new Map();
  for (const c of pool) {
    const id = familyOf(c.hex);
    const cur = byFamily.get(id);
    if (!cur) byFamily.set(id, { family: id, weight: c.weight, topHex: c.hex, topWeight: c.weight });
    else {
      cur.weight += c.weight;
      if (c.weight > cur.topWeight) { cur.topHex = c.hex; cur.topWeight = c.weight; }
    }
  }
  const total = [...byFamily.values()].reduce((s, f) => s + f.weight, 0);
  let list = [...byFamily.values()]
    .map((f) => ({ hex: f.topHex, family: f.family, share: f.weight / total }))
    .sort((a, b) => b.share - a.share || a.family.localeCompare(b.family));
  const strong = list.filter((c) => c.share >= COLOUR_RULES.minShare);
  list = (strong.length ? strong : list.slice(0, 1)).slice(0, COLOUR_RULES.keep);
  const sum = list.reduce((s, c) => s + c.share, 0);
  return list.map((c) => ({ hex: c.hex, family: c.family, share: Math.round((c.share / sum) * 100) / 100 }));
}

// Everyday colour words that are not one of our families. Each is a representative hex, then mapped to the nearest family.
const COLOUR_WORDS = {
  gold: '#C9A23F', golden: '#C9A23F', silver: '#B4B4BC', beige: '#D8C3A5', cream: '#F3EBD9', 'off-white': '#F3EBD9', white: '#FFFFFF',
  pink: '#E8A0B4', 'hot-pink': '#D6247F', purple: '#6A3D8F', violet: '#6A3D8F', blue: '#2748B5', 'sky-blue': '#A9C7E8', green: '#2E8B57',
  orange: '#E88B1A', yellow: '#F2D13B', wine: '#6E1A2D', burgundy: '#6E1A2D', turquoise: '#12787A', gray: '#8A8A92', nude: '#D9A184',
  lavender: '#C2B2E0', rust: '#B5503C', tan: '#B98A5B', khaki: '#B9A66B', copper: '#B87333', 'rose-gold': '#D9A59A', multicolour: null, multicolor: null,
};

/** Resolves one colour written by a retailer: a hex ("#a1b2c3" or "a1b2c3") or a family id/label ("Maroon", "royal blue"). */
export function parseColourToken(token) {
  const t = String(token ?? '').trim();
  if (!t) return null;
  const hex = normaliseHex(t);
  if (hex) return { hex, family: familyOf(hex) };
  const key = t.toLowerCase().replace(/[\s_]+/g, '-');
  const hit = Object.entries(COLOUR_FAMILIES).find(([id, f]) => id === key || f.label.toLowerCase().replace(/\s+/g, '-') === key);
  if (hit) return { hex: hit[1].hex, family: hit[0] };
  const word = COLOUR_WORDS[key];
  return word ? { hex: word, family: familyOf(word) } : null;
}

/** Explicit colours (from a CSV column or JSON array) become the item's colours, equally weighted, first colour counts most. */
export function explicitColours(tokens) {
  const parsed = tokens.map(parseColourToken);
  if (parsed.some((p) => !p)) return { error: tokens.filter((_, i) => !parsed[i]) };
  const seen = new Set();
  const uniq = parsed.filter((p) => (seen.has(p.family) ? false : seen.add(p.family)));
  const weights = uniq.map((_, i) => uniq.length - i);
  const total = weights.reduce((a, b) => a + b, 0);
  return { colours: uniq.slice(0, COLOUR_RULES.keep).map((p, i) => ({ hex: p.hex, family: p.family, share: Math.round((weights[i] / total) * 100) / 100 })) };
}

/**
 * Dominant colours from decoded RGBA pixels. Pixels are bucketed into 4 bits per channel, transparent pixels ignored,
 * and the background removed first when the image border is a plain colour (a product shot on white or a flat colour).
 * Returns { colours, plainBackground }.
 */
export function coloursFromPixels({ data, width, height }) {
  const step = COLOUR_RULES.sampleStep;
  const px = (x, y) => {
    const i = (y * width + x) * 4;
    return data[i + 3] < 128 ? null : [data[i], data[i + 1], data[i + 2]];
  };
  const hexOf = (p) => rgbToHex(p[0], p[1], p[2]);

  // Border sample: is the background one plain colour?
  const border = [];
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 24))) { border.push(px(x, 0), px(x, height - 1)); }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 24))) { border.push(px(0, y), px(width - 1, y)); }
  const opaque = border.filter(Boolean);
  const transparentBorder = border.length - opaque.length > border.length / 2;
  let bgLab = null;
  let plainBackground = transparentBorder;
  if (!transparentBorder && opaque.length) {
    const med = (k) => opaque.map((p) => p[k]).sort((a, b) => a - b)[Math.floor(opaque.length / 2)];
    const mid = hexToLab(rgbToHex(med(0), med(1), med(2)));
    const close = opaque.filter((p) => deltaE(hexToLab(hexOf(p)), mid) <= COLOUR_RULES.backgroundUniformDeltaE).length / opaque.length;
    if (close >= 0.9) { bgLab = mid; plainBackground = true; }
  }

  const collect = (removeBg) => {
    const buckets = new Map();
    let total = 0;
    let kept = 0;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const p = px(x, y);
        if (!p) continue;
        total++;
        if (removeBg && deltaE(hexToLab(hexOf(p)), bgLab) <= COLOUR_RULES.backgroundUniformDeltaE) continue;
        kept++;
        const key = ((p[0] >> 4) << 8) | ((p[1] >> 4) << 4) | (p[2] >> 4);
        const b = buckets.get(key);
        if (b) { b.n++; b.r += p[0]; b.g += p[1]; b.b += p[2]; } else buckets.set(key, { n: 1, r: p[0], g: p[1], b: p[2] });
      }
    }
    return { buckets, share: total ? kept / total : 0 };
  };
  let pass = collect(Boolean(bgLab));
  // A white shirt on a white background: nothing is left once the background is removed, so keep every pixel instead.
  const removedAll = Boolean(bgLab) && pass.share < COLOUR_RULES.minGarmentShare;
  if (removedAll) pass = collect(false);
  const buckets = pass.buckets;
  const raw = [...buckets.values()].map((b) => ({ hex: rgbToHex(b.r / b.n, b.g / b.n, b.b / b.n), weight: b.n }));
  return { colours: finaliseColours(raw, { dropBackground: !bgLab || removedAll }), plainBackground };
}
