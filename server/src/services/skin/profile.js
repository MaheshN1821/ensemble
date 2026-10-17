import {
  COLOUR_FAMILIES, DEPTHS, DEPTH_NOTES, LIPSTICKS, LIP_TIERS, METAL_BY_UNDERTONE, METAL_LABELS,
  PALE_FAMILIES, PALETTES, UNDERTONES,
} from '../../config/skin.js';
import { AVOID_COLOURS, METALS } from '../../config/intake.js';

const depthLabel = (id) => DEPTHS.find((d) => d.id === id)?.label ?? id;
const undertoneLabel = (id) => UNDERTONES.find((u) => u.id === id)?.label ?? id;
const swatch = (id) => ({ id, label: COLOUR_FAMILIES[id].label, hex: COLOUR_FAMILIES[id].hex });

export const DEPTH_IDS = DEPTHS.map((d) => d.id);
export const UNDERTONE_IDS = UNDERTONES.map((u) => u.id);

export const profileOptions = () => ({
  depths: DEPTHS.map(({ id, label }) => ({ id, label })),
  undertones: UNDERTONES.map(({ id, label, blurb }) => ({ id, label, blurb })),
});

/** The stored document: what was detected, never what the person overrode (that lives in `override`). */
export function buildStoredProfile({ classification, selfieKey, source, units = 0, unitsKnown = true, taskId = null, signals = [] }) {
  return {
    selfieKey,
    source, // 'youcam' | 'sample'
    analysedAt: new Date(),
    skin: { hex: classification.hex, ...classification.measure },
    depth: classification.depth,
    undertone: classification.undertone,
    signals,
    units,
    unitsKnown,
    taskId,
    override: null,
  };
}

/** What the planner and the screens use: detection with the person's override applied on top. */
export function effectiveProfile(stored) {
  if (!stored) return null;
  const o = stored.override ?? {};
  return {
    depth: o.depth ?? stored.depth.id,
    undertone: o.undertone ?? stored.undertone.id,
    overridden: Boolean(o.depth || o.undertone),
  };
}

/** Palette: colours to lead with, colours to wear with care, metals and lipstick. Respects "colours to avoid". */
export function buildPalette({ undertone, depth }, prefs = {}) {
  const base = PALETTES[undertone];
  const avoid = new Set(prefs.avoidColours ?? []);
  const allowed = (id) => !avoid.has(COLOUR_FAMILIES[id].group);

  let best = base.best;
  let careful = [...base.careful];
  if (depth === 'very-light' || depth === 'light') {
    // Very pale tones can wash out very light skin: move them from "best" to "with care".
    const pale = best.filter((id) => PALE_FAMILIES.includes(id));
    best = best.filter((id) => !PALE_FAMILIES.includes(id));
    careful = [...careful, ...pale];
  }
  const skipped = [...new Set(base.best.concat(base.careful).filter((id) => !allowed(id)).map((id) => COLOUR_FAMILIES[id].group))]
    .map((g) => AVOID_COLOURS.find((c) => c.id === g)?.label)
    .filter(Boolean);

  const metals = METAL_BY_UNDERTONE[undertone];
  const wanted = prefs.metal && prefs.metal !== 'any' ? prefs.metal : null;
  let metalNote = `${METAL_LABELS[metals.primary]} suits your undertone best. ${METAL_LABELS[metals.secondary]} also works.`;
  if (wanted && wanted !== metals.primary) {
    const label = METALS.find((m) => m.id === wanted)?.label ?? wanted;
    metalNote = `You asked for ${label.toLowerCase()}, so we will use it. ${METAL_LABELS[metals.primary]} would be our first pick for your undertone.`;
  }

  const tier = LIP_TIERS[depth];
  return {
    best: best.filter(allowed).map(swatch),
    careful: careful.filter(allowed).map(swatch),
    skippedForYou: skipped,
    metals: { primary: metals.primary, secondary: metals.secondary, note: metalNote },
    lips: LIPSTICKS[undertone].map((l) => ({ id: l.id, label: l.label, hex: l.hex[tier] })),
    depthNote: DEPTH_NOTES[depth],
  };
}

const CONFIDENCE_TEXT = {
  high: 'We are fairly sure of this reading.',
  medium: 'This reading is a good guess. If it does not look like you, adjust it below.',
  low: 'This one is close to the line between two undertones. Check it against what you know, and adjust it below if needed.',
};

/** The response shape for the client. */
export function presentProfile(stored, prefs, { cached = false } = {}) {
  if (!stored) return null;
  const eff = effectiveProfile(stored);
  const detectedUndertone = stored.undertone.id;
  const detectedDepth = stored.depth.id;
  return {
    source: stored.source,
    analysedAt: stored.analysedAt,
    cached,
    units: stored.units,
    unitsKnown: stored.unitsKnown,
    skin: { hex: stored.skin.hex },
    depth: { id: eff.depth, label: depthLabel(eff.depth), detected: detectedDepth, detectedLabel: depthLabel(detectedDepth) },
    undertone: {
      id: eff.undertone,
      label: undertoneLabel(eff.undertone),
      detected: detectedUndertone,
      detectedLabel: undertoneLabel(detectedUndertone),
      confidence: stored.undertone.confidence,
      confidenceText: CONFIDENCE_TEXT[stored.undertone.confidence],
      source: stored.undertone.source,
    },
    overridden: eff.overridden,
    measure: { L: stored.skin.L, a: stored.skin.a, b: stored.skin.b, ita: stored.skin.ita, hue: stored.skin.hue, chroma: stored.skin.chroma },
    signals: stored.signals,
    palette: buildPalette(eff, prefs ?? {}),
    options: profileOptions(),
  };
}
