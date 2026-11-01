import { COLOUR_FAMILIES, DEPTHS, LIPSTICKS, LIP_TIERS, METAL_BY_UNDERTONE, METAL_LABELS, UNDERTONES } from '../../config/skin.js';
import { AVOID_COLOURS, OCCASIONS } from '../../config/intake.js';
import {
  CONTEMPORARY_SILHOUETTES, DEFAULT_OCCASION, METAL_FAMILIES, OCCASION_KEYWORDS, OCCASION_RULES, SCORING as S,
  SKIN_LIGHTNESS, TRADITIONAL_SILHOUETTES, WEIGHTS,
} from '../../config/planner.js';
import { buildPalette } from '../skin/profile.js';
import { hexToLab } from '../skin/classify.js';

const labCache = new Map();
const lab = (hex) => { let v = labCache.get(hex); if (!v) { v = hexToLab(hex); labCache.set(hex, v); } return v; };
const chroma = (l) => Math.hypot(l.a, l.b);
const hueOf = (l) => (Math.atan2(l.b, l.a) * 180) / Math.PI;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export const familyLabel = (id) => COLOUR_FAMILIES[id]?.label ?? id;
const lower = (s) => s.toLowerCase();
const METAL_NAME = { ...METAL_LABELS, oxidised: 'Oxidised silver' };
export const SLOTS = ['outfit', 'earrings', 'eyewear', 'lipstick', 'blush', 'foundation', 'watch'];
export const JEWELLERY = ['earrings', 'eyewear', 'watch'];

// ---- Context: everything about the shopper the scores need, resolved once ----

/** Matches what the person typed for an "other" occasion to a preset, or says there is no match. */
export function resolveOccasion(prefs) {
  const preset = OCCASIONS.find((o) => o.id === prefs?.occasion);
  if (preset) return { id: preset.id, label: preset.label, source: 'preset', ...OCCASION_RULES[preset.id] };
  const text = String(prefs?.occasionText ?? '');
  const hit = OCCASION_KEYWORDS.find(([re]) => re.test(text));
  if (hit) {
    const label = OCCASIONS.find((o) => o.id === hit[1]).label;
    return { id: hit[1], label: text.trim() || label, source: 'text', ...OCCASION_RULES[hit[1]] };
  }
  return { id: null, label: text.trim() || 'Your occasion', source: 'default', ...DEFAULT_OCCASION };
}

function leaningOf(silhouettes) {
  const t = silhouettes.some((s) => TRADITIONAL_SILHOUETTES.includes(s));
  const c = silhouettes.some((s) => CONTEMPORARY_SILHOUETTES.includes(s));
  if (t && !c) return 'traditional';
  if (c && !t) return 'contemporary';
  return 'mixed';
}

/**
 * @param profile  { depth, undertone } the EFFECTIVE values (override applied), see effectiveProfile()
 * @param prefs    the intake preferences
 * @param constraints optional refinements: { excludeItemIds, budgetInr, formalityShift, forceMetal, preferFamilies }
 */
export function buildContext({ profile, prefs, constraints = {} }) {
  const palette = buildPalette(profile, prefs ?? {});
  const occasion = resolveOccasion(prefs);
  const shift = clamp(constraints.formalityShift ?? 0, -2, 2);
  const formality = (occasion.formality ?? DEFAULT_OCCASION.formality).map((f) => clamp(f + shift, 1, 5));
  const metalPref = constraints.forceMetal ?? (prefs?.metal && prefs.metal !== 'any' ? prefs.metal : null);
  const silhouettes = prefs?.silhouettes ?? [];
  const budget = constraints.budgetInr ?? prefs?.budgetInr;
  return {
    depth: profile.depth,
    undertone: profile.undertone,
    undertoneLabel: lower(UNDERTONES.find((u) => u.id === profile.undertone)?.label ?? profile.undertone),
    skinL: SKIN_LIGHTNESS[profile.depth] ?? 55,
    best: new Set(palette.best.map((s) => s.id)),
    careful: new Set(palette.careful.map((s) => s.id)),
    metals: METAL_BY_UNDERTONE[profile.undertone],
    metalPref,
    avoidGroups: new Set(prefs?.avoidColours ?? []),
    avoidLabels: (prefs?.avoidColours ?? []).map((id) => lower(AVOID_COLOURS.find((c) => c.id === id)?.label ?? id)),
    silhouettes,
    leaning: leaningOf(silhouettes),
    occasion: { ...occasion, formality },
    lips: palette.lips,
    budget,
    excludeItemIds: new Set(constraints.excludeItemIds ?? []),
    preferFamilies: new Set(constraints.preferFamilies ?? []),
  };
}

// ---- Helpers ----
const groupOf = (family) => COLOUR_FAMILIES[family]?.group ?? null;
const colourList = (item) => item?.colours ?? [];
export const primaryColour = (item) => [...colourList(item)].sort((a, b) => b.share - a.share)[0] ?? null;
const rule = (component, kind, code, text, itemIds = []) => ({ component, kind, code, text, itemIds });

function hueHarmony(hexA, hexB) {
  const a = lab(hexA); const b = lab(hexB);
  if (chroma(a) < S.neutralChroma || chroma(b) < S.neutralChroma) return S.neutralScore;
  let d = Math.abs(hueOf(a) - hueOf(b));
  if (d > 180) d = 360 - d;
  return S.hue.find((h) => d <= h.maxDiff).score;
}

/** Weighted harmony of one colour against a list of weighted colours. */
const harmonyWithOutfit = (hex, outfit) => {
  const cols = colourList(outfit);
  if (!cols.length) return S.neutralScore;
  return cols.reduce((sum, c) => sum + c.share * hueHarmony(hex, c.hex), 0);
};

const formalityScore = (formality, [lo, hi]) => {
  const dist = formality < lo ? lo - formality : formality > hi ? formality - hi : 0;
  return { dist, value: S.formalityByDistance[Math.min(dist, S.formalityByDistance.length - 1)] };
};
export const formalityDistance = (formality, [lo, hi]) => (formality < lo ? lo - formality : formality > hi ? formality - hi : 0);

// ---- Component 1: colour harmony (outfit vs skin and undertone) ----
function scoreColour(items, ctx) {
  const rules = [];
  const o = items.outfit;
  const cols = colourList(o);
  if (!cols.length) {
    rules.push(rule('colour', 'caution', 'colour-unknown', `We could not read the colours of ${o.name}, so its colour match is estimated.`, [o.id]));
    return { value: S.noColours, rules };
  }
  let value = 0;
  for (const c of cols) {
    const fit = ctx.best.has(c.family) ? S.familyBest : ctx.careful.has(c.family) ? S.familyCareful : S.familyOther;
    const gap = Math.abs(lab(c.hex).L - ctx.skinL);
    const contrast = clamp(0.5 + gap / S.contrastSpan, 0.5, 1);
    value += c.share * (S.familyShare * fit + (1 - S.familyShare) * contrast);
    if (c.share >= S.minRuleShare) {
      const name = familyLabel(c.family);
      if (ctx.best.has(c.family)) rules.push(rule('colour', 'positive', 'colour-suits', `${name} is one of the colours that suit your ${ctx.undertoneLabel} undertone.`, [o.id]));
      else if (ctx.careful.has(c.family)) rules.push(rule('colour', 'caution', 'colour-careful', `${name} is a colour we suggest wearing with care for your ${ctx.undertoneLabel} undertone, so we balanced it with the rest of the look.`, [o.id]));
      else rules.push(rule('colour', 'neutral', 'colour-neutral', `${name} works with most undertones.`, [o.id]));
    }
  }
  const lead = primaryColour(o);
  const gap = Math.abs(lab(lead.hex).L - ctx.skinL);
  if (gap >= S.contrastGood) rules.push(rule('colour', 'positive', 'contrast-clear', `The outfit’s main colour stands out clearly from your skin colour.`, [o.id]));
  else if (gap < S.contrastLow) rules.push(rule('colour', 'neutral', 'contrast-soft', `The outfit’s main colour is close to your skin colour in lightness, which gives a softer look.`, [o.id]));
  return { value: clamp(value, 0, 1), rules };
}

// ---- Component 2: occasion fit ----
function scoreOccasion(items, ctx) {
  const rules = [];
  const occ = ctx.occasion;
  const o = items.outfit;
  const label = occ.label.toLowerCase();
  const of = formalityScore(o.formality, occ.formality);
  if (of.dist === 0) rules.push(rule('occasion', 'positive', 'formality-fits', `${o.name} is dressy enough for ${label} (formality ${o.formality} of 5).`, [o.id]));
  else rules.push(rule('occasion', 'caution', 'formality-off', `${o.name} is ${o.formality < occ.formality[0] ? 'more casual' : 'dressier'} than usual for ${label}.`, [o.id]));

  let tag = S.tagUntagged;
  if (occ.id && o.occasions?.length) {
    tag = o.occasions.includes(occ.id) ? S.tagMatch : S.tagOther;
    if (tag === S.tagMatch) rules.push(rule('occasion', 'positive', 'tag-match', `The catalog tags ${o.name} for this occasion.`, [o.id]));
  }

  const jewels = JEWELLERY.map((s) => items[s]).filter(Boolean);
  const jf = jewels.length ? jewels.reduce((sum, j) => sum + formalityScore(j.formality, occ.formality).value, 0) / jewels.length : S.noJewelleryFormality;
  const countOk = occ.jewellery === 0 ? 1 : Math.min(jewels.length / occ.jewellery, 1);
  if (jewels.length && jf >= 0.9) rules.push(rule('occasion', 'positive', 'jewellery-fits', 'The jewellery matches the formality of the outfit and the occasion.', jewels.map((j) => j.id)));
  if (occ.jewellery > 0 && jewels.length < occ.jewellery) rules.push(rule('occasion', 'caution', 'jewellery-light', `${label[0].toUpperCase()}${label.slice(1)} usually calls for jewellery or accessories, and this look has ${jewels.length ? 'less' : 'none'}.`, jewels.map((j) => j.id)));

  const p = S.occasionParts;
  return { value: clamp(p.outfitFormality * of.value + p.outfitTag * tag + p.jewelleryFormality * jf + p.jewelleryCount * countOk, 0, 1), rules };
}

// ---- Component 3: palette coherence (lipstick and jewellery stones vs outfit; lipstick vs profile) ----
const stoneColours = (j) => colourList(j).filter((c) => !(METAL_FAMILIES[j.metalTone] ?? []).includes(c.family));

export function lipFit(lipHex, ctx) {
  const d = Math.min(...ctx.lips.map((l) => { const a = lab(lipHex); const b = lab(l.hex); return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b); }));
  const i = S.lipFitDeltaE.findIndex((t) => d <= t);
  return { distance: d, value: S.lipFitScores[i === -1 ? S.lipFitScores.length - 1 : i] };
}

function scorePalette(items, ctx) {
  const rules = [];
  const parts = [];
  const o = items.outfit;
  const lip = items.lipstick;
  if (lip) {
    const hex = primaryColour(lip)?.hex;
    if (hex) {
      const h = harmonyWithOutfit(hex, o);
      parts.push(h);
      if (h >= 0.85) rules.push(rule('palette', 'positive', 'lip-outfit', `${lip.name} sits comfortably with the outfit colours.`, [lip.id, o.id]));
      else if (h < 0.6) rules.push(rule('palette', 'caution', 'lip-clash', `${lip.name} is quite different in hue from the outfit, which makes a bolder contrast.`, [lip.id, o.id]));
      const f = lipFit(hex, ctx);
      parts.push(f.value);
      if (f.value >= 0.75) rules.push(rule('palette', 'positive', 'lip-profile', `${lip.name} is close to the lipstick shades matched to your undertone and depth.`, [lip.id]));
      else if (f.value <= 0.5) rules.push(rule('palette', 'neutral', 'lip-profile-far', `${lip.name} is outside the lipstick shades we matched to your profile.`, [lip.id]));
    }
  }
  for (const slot of JEWELLERY) {
    const j = items[slot];
    if (!j) continue;
    const stones = stoneColours(j);
    if (!stones.length) { parts.push(S.neutralScore); continue; }
    const total = stones.reduce((s, c) => s + c.share, 0) || 1;
    const h = stones.reduce((sum, c) => sum + (c.share / total) * harmonyWithOutfit(c.hex, o), 0);
    parts.push(h);
    if (h >= 0.85) rules.push(rule('palette', 'positive', 'stones-outfit', `The ${familyLabel(stones[0].family).toLowerCase()} in ${j.name} goes with the outfit colours.`, [j.id, o.id]));
    else if (h < 0.6) rules.push(rule('palette', 'caution', 'stones-clash', `The ${familyLabel(stones[0].family).toLowerCase()} in ${j.name} is a bold contrast to the outfit.`, [j.id, o.id]));
  }
  return { value: parts.length ? clamp(parts.reduce((a, b) => a + b, 0) / parts.length, 0, 1) : S.neutralScore, rules };
}

// ---- Component 4: metal tone ----
function metalValue(metal, ctx) {
  if (ctx.metalPref) return metal === ctx.metalPref ? S.metalPrefMatch : S.metalPrefMiss;
  if (metal === ctx.metals.primary) return S.metalPrimary;
  if (metal === ctx.metals.secondary) return S.metalSecondary;
  if (metal === 'oxidised') return S.metalOxidised;
  return S.metalOther;
}
export const metalFit = (item, ctx) => metalValue(item.metalTone, ctx);

function scoreMetal(items, ctx) {
  const rules = [];
  const jewels = JEWELLERY.map((s) => items[s]).filter(Boolean);
  if (!jewels.length) {
    rules.push(rule('metal', 'neutral', 'metal-none', 'This look has no jewellery, so metal tone is not part of its score.'));
    return { value: S.metalNone, rules };
  }
  let value = jewels.reduce((s, j) => s + metalValue(j.metalTone, ctx), 0) / jewels.length;
  const ids = jewels.map((j) => j.id);
  const name = (m) => METAL_NAME[m] ?? m;
  const m0 = jewels[0].metalTone;
  const mixed = jewels.some((j) => j.metalTone !== m0);
  if (mixed) { value *= S.metalMixedFactor; rules.push(rule('metal', 'caution', 'metal-mixed', 'The accessories are different metals, which can look less matched.', ids)); }
  else if (ctx.metalPref) {
    if (m0 === ctx.metalPref) rules.push(rule('metal', 'positive', 'metal-pref', `${name(m0)} jewellery matches the metal you asked for.`, ids));
  } else if (m0 === ctx.metals.primary) rules.push(rule('metal', 'positive', 'metal-primary', `${name(m0)} is our first pick for your ${ctx.undertoneLabel} undertone.`, ids));
  else if (m0 === ctx.metals.secondary) rules.push(rule('metal', 'positive', 'metal-secondary', `${name(m0)} also works well with your ${ctx.undertoneLabel} undertone.`, ids));
  else rules.push(rule('metal', 'neutral', 'metal-other', `${name(m0)} is not our first metal for your undertone, but it is in the look for balance with the outfit.`, ids));
  return { value: clamp(value, 0, 1), rules };
}

// ---- Component 5: preferences ----
export const avoidedPrimary = (item, ctx) => {
  const p = primaryColour(item);
  return Boolean(p && p.share >= S.primaryShare && ctx.avoidGroups.has(groupOf(p.family)));
};

function scorePreferences(items, ctx) {
  const rules = [];
  const o = items.outfit;
  const parts = [];
  let any = false;

  if (ctx.avoidGroups.size) {
    any = true;
    let v = 1;
    const hits = [];
    for (const it of Object.values(items)) {
      if (!it) continue;
      for (const c of colourList(it)) {
        if (ctx.avoidGroups.has(groupOf(c.family)) && c.share >= S.minRuleShare) { v -= S.avoidSecondaryPenalty; hits.push(`${familyLabel(c.family).toLowerCase()} in ${it.name}`); }
      }
    }
    parts.push(clamp(v, 0, 1));
    if (!hits.length) rules.push(rule('preferences', 'positive', 'avoid-ok', `Nothing in this look is in the colours you asked to avoid (${ctx.avoidLabels.join(', ')}).`));
    else rules.push(rule('preferences', 'caution', 'avoid-minor', `This look includes ${hits.join(' and ')}, a colour you asked to avoid, though only as a minor part.`));
  }
  if (ctx.silhouettes.length) {
    any = true;
    const ok = ctx.silhouettes.includes(o.silhouette);
    parts.push(ok ? S.silhouetteMatch : S.silhouetteMiss);
    if (ok) rules.push(rule('preferences', 'positive', 'silhouette', `${o.name} is a style you chose (${o.silhouette.replace('-', ' ')}).`, [o.id]));
    else rules.push(rule('preferences', 'caution', 'silhouette-miss', `${o.name} is not one of the outfit styles you chose.`, [o.id]));
  }
  if (ctx.leaning !== 'mixed' && ctx.silhouettes.length) {
    const style = o.style;
    parts.push(style === ctx.leaning ? S.styleMatch : style === 'fusion' ? S.styleFusion : style ? S.styleMiss : S.styleFusion);
  }
  if (ctx.preferFamilies.size) {
    any = true;
    const hit = colourList(o).some((c) => ctx.preferFamilies.has(c.family) && c.share >= S.minRuleShare);
    parts.push(hit ? 1 : 0.3);
    if (hit) rules.push(rule('preferences', 'positive', 'family-asked', `The outfit is in the colour direction you asked for.`, [o.id]));
  }
  return { value: any ? clamp(parts.reduce((a, b) => a + b, 0) / parts.length, 0, 1) : S.noPreference, rules };
}

const SCORERS = { colour: scoreColour, occasion: scoreOccasion, palette: scorePalette, metal: scoreMetal, preferences: scorePreferences };

/**
 * Scores one look. `items` is { outfit, earrings?, lipstick?, eyewear?, watch? } (catalog items as presented by the catalog service).
 * Returns { total (0-100, integer), components: { key: { label?, weight, value (0-1), points } }, rules[] }.
 */
export function scoreLook(items, ctx) {
  if (!items?.outfit) throw new Error('A look needs an outfit');
  const components = {};
  const rules = [];
  let total = 0;
  for (const [key, fn] of Object.entries(SCORERS)) {
    const r = fn(items, ctx);
    const points = r.value * WEIGHTS[key];
    components[key] = { weight: WEIGHTS[key], value: round(r.value, 3), points: round(points, 1) };
    total += points;
    rules.push(...r.rules);
  }
  return { total: Math.round(total), exact: total, components, rules };
}

export { DEPTHS, LIPSTICKS, LIP_TIERS };
