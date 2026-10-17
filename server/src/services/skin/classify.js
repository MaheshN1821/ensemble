import { DEPTHS, UNDERTONES, UNDERTONE_RULES } from '../../config/skin.js';

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export const normaliseHex = (value) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value ?? '').trim());
  return m ? `#${m[1].toUpperCase()}` : null;
};

export function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** sRGB hex to CIELAB (D65). */
export function hexToLab(hex) {
  const h = normaliseHex(hex);
  if (!h) throw new Error(`Not a hex colour: ${hex}`);
  const lin = (i) => {
    const v = parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(0), lin(1), lin(2)];
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Individual Typology Angle in degrees. Higher means lighter skin. */
export function ita({ L, b }) {
  // b* is positive for any real skin colour; guard anyway so a bad reading cannot divide by zero.
  const bb = Math.abs(b) < 0.5 ? 0.5 : b;
  return (Math.atan2(L - 50, bb) * 180) / Math.PI;
}

export function classifyDepth(angle) {
  return DEPTHS.find((d) => angle >= d.minIta) ?? DEPTHS.at(-1);
}

/**
 * Undertone from Lab. Returns the id and how sure we are, based on how far the reading sits from the nearest rule boundary.
 * A single colour from a lit selfie is noisy, so a reading near a boundary is reported as low confidence.
 */
export function classifyUndertone({ L = 50, a, b }) {
  const r = UNDERTONE_RULES;
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  const chroma = Math.hypot(a, b);

  const olive = hue >= r.oliveFromHue && chroma <= r.oliveMaxChroma && L <= r.oliveMaxLightness;
  let id;
  let margin;
  if (olive) {
    id = 'olive';
    margin = Math.min(hue - r.oliveFromHue, r.oliveMaxChroma - chroma);
  } else if (hue < r.coolBelowHue) {
    id = 'cool';
    margin = r.coolBelowHue - hue;
  } else if (hue >= r.warmFromHue) {
    id = 'warm';
    margin = hue - r.warmFromHue;
    // A warm reading just outside the olive window is also close to a boundary.
    if (hue >= r.oliveFromHue) margin = Math.min(margin, chroma - r.oliveMaxChroma);
  } else {
    id = 'neutral';
    margin = Math.min(hue - r.coolBelowHue, r.warmFromHue - hue);
  }
  const confidence = margin >= r.highMargin ? 'high' : margin >= r.mediumMargin ? 'medium' : 'low';
  return { id, confidence, hue, chroma };
}

/** Maps a free-text label from the API ("Warm", "cool undertone") to one of our ids, or null. */
export function undertoneFromLabel(label) {
  const s = String(label ?? '').toLowerCase();
  return UNDERTONES.find((u) => new RegExp(`\\b${u.id}\\b`).test(s))?.id ?? null;
}

/**
 * Turns the signals read from the API (a skin colour, and optionally an undertone label) into a classification.
 * An explicit undertone from the API wins; if our colour rules disagree with it the confidence drops to low.
 */
export function classifySkin({ hex, apiUndertone = null }) {
  const lab = hexToLab(hex);
  const angle = ita(lab);
  const depth = classifyDepth(angle);
  const rule = classifyUndertone(lab);

  let undertone = { id: rule.id, source: 'colour', confidence: rule.confidence };
  if (apiUndertone) {
    undertone = { id: apiUndertone, source: 'api', confidence: apiUndertone === rule.id ? 'high' : 'low' };
  }
  return {
    hex: normaliseHex(hex),
    depth: { id: depth.id, source: 'colour' },
    undertone,
    measure: { L: round(lab.L), a: round(lab.a), b: round(lab.b), ita: round(angle), hue: round(rule.hue), chroma: round(rule.chroma) },
  };
}
