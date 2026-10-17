import { normaliseHex, rgbToHex, undertoneFromLabel } from './classify.js';

/**
 * Reads the skin colour (and an undertone label, if there is one) out of a skin-tone-analysis result.
 *
 * The exact result structure is not pinned down yet (CONTEXT.md, item 2), so this walks the whole JSON and
 * scores candidates by their key path instead of assuming a shape. Once a real response has been seen, replace
 * the scoring with a direct read of the confirmed field and keep these cases as tests.
 *
 * Returns { hex, apiUndertone, signals } or null when no usable skin colour was found.
 * `signals` lists the key paths used, so the trace can say where each value came from.
 */

const GOOD_HINTS = [['skin', 3], ['tone', 2], ['colo', 2], ['average', 1], ['dominant', 1], ['avg', 1], ['hex', 1]];
const BAD_HINTS = ['lip', 'hair', 'eye', 'brow', 'background', 'cloth', 'mask', 'url', 'id'];

const isChannel = (v) => typeof v === 'number' && v >= 0 && v <= 255;

function scorePath(path) {
  const p = path.toLowerCase();
  if (BAD_HINTS.some((h) => new RegExp(`(^|[._\\[])${h}`).test(p))) return null;
  return GOOD_HINTS.reduce((s, [h, w]) => (p.includes(h) ? s + w : s), 0);
}

export function extractSkinSignals(results) {
  const colours = [];
  const labels = [];

  const walk = (node, path) => {
    if (node === null || node === undefined) return;

    if (typeof node === 'string') {
      const hex = normaliseHex(node);
      if (hex) {
        const score = scorePath(path);
        if (score !== null) colours.push({ hex, score, path });
      } else if (/undertone|tone_type|skin_type/i.test(path)) {
        const id = undertoneFromLabel(node);
        if (id) labels.push({ id, path });
      }
      return;
    }

    if (Array.isArray(node)) {
      // [r, g, b] under a colour-ish key
      if (node.length === 3 && node.every(isChannel)) {
        const score = scorePath(path);
        if (score !== null && /rgb|colo|tone|skin/i.test(path)) colours.push({ hex: rgbToHex(...node), score, path });
        return;
      }
      node.forEach((n, i) => walk(n, `${path}[${i}]`));
      return;
    }

    if (typeof node === 'object') {
      // { r, g, b }
      const { r, g, b } = node;
      if (isChannel(r) && isChannel(g) && isChannel(b)) {
        const score = scorePath(path);
        if (score !== null) colours.push({ hex: rgbToHex(r, g, b), score, path });
        return;
      }
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
    }
  };

  walk(results, '');
  if (!colours.length) return null;

  // Highest score wins; on a tie the first one found (API order) wins.
  const best = colours.reduce((a, c) => (c.score > a.score ? c : a));
  const label = labels[0];
  return {
    hex: best.hex,
    apiUndertone: label?.id ?? null,
    signals: [best.path || '(root)', ...(label ? [label.path] : [])],
  };
}

/** Compact description of a result's shape (keys only, no values), for error details the owner can paste back. */
export function describeShape(node, depth = 0) {
  if (node === null || typeof node !== 'object' || depth > 3) return typeof node;
  if (Array.isArray(node)) return [node.length ? describeShape(node[0], depth + 1) : 'empty'];
  return Object.fromEntries(Object.entries(node).slice(0, 12).map(([k, v]) => [k, describeShape(v, depth + 1)]));
}
