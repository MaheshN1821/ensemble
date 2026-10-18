/**
 * Everything the look planner decides with, in one place (PRD section 8). Edit weights, rules and thresholds here only.
 * These are styling rules of thumb, not science and not a beauty or medical rating. The planner is deterministic:
 * the same inputs always give the same three looks. The language model (Stage 7) never picks items, prices or scores.
 */

// ---- Weights: points out of 100. Budget is a hard limit, not a weight. ----
export const WEIGHTS = { colour: 35, occasion: 25, palette: 15, metal: 15, preferences: 10 };
if (Object.values(WEIGHTS).reduce((a, b) => a + b, 0) !== 100) throw new Error('Planner weights must add up to 100');

export const COMPONENTS = {
  colour: { label: 'Colour harmony', blurb: 'How the outfit’s colours sit with your undertone, and how much they stand out from your skin colour.' },
  occasion: { label: 'Occasion fit', blurb: 'Whether the outfit and jewellery are as dressy as the occasion calls for.' },
  palette: { label: 'Palette coherence', blurb: 'Whether the lipstick and any jewellery stones go with the outfit colours, and the lipstick with your profile.' },
  metal: { label: 'Metal tone', blurb: 'Gold, silver or rose gold against your undertone and your metal preference.' },
  preferences: { label: 'Your preferences', blurb: 'Colours you asked to avoid, and the outfit styles you chose.' },
};

export const SCORE_NOTE = 'Match score (0 to 100) comes from our styling rules for colour, occasion, metal and your preferences. It is guidance, not a rating of you.';

// ---- Skin lightness (CIELAB L*) typical of each depth, used only to judge how much an outfit stands out from the skin ----
export const SKIN_LIGHTNESS = { 'very-light': 80, light: 70, medium: 60, tan: 50, deep: 38, 'very-deep': 28 };

// ---- Occasions: how formal the outfit should be (1 casual to 5 very formal) and how many jewellery pieces are expected ----
export const OCCASION_RULES = {
  'wedding-guest': { formality: [4, 5], jewellery: 2 },
  'sangeet-mehendi': { formality: [3, 5], jewellery: 2 },
  festive: { formality: [3, 5], jewellery: 2 },
  office: { formality: [2, 3], jewellery: 1 },
  interview: { formality: [3, 4], jewellery: 1 },
  'date-night': { formality: [2, 4], jewellery: 1 },
  brunch: { formality: [1, 3], jewellery: 0 },
  cocktail: { formality: [3, 4], jewellery: 1 },
};
// "Other" occasions are matched from the words the person typed. First match wins.
export const OCCASION_KEYWORDS = [
  [/\b(wedding|shaadi|reception|engagement|baraat)\b/i, 'wedding-guest'],
  [/\b(sangeet|mehendi|mehndi|haldi)\b/i, 'sangeet-mehendi'],
  [/\b(puja|pooja|diwali|festival|festive|eid|navratri|garba|onam|pongal|holi|karwa)\b/i, 'festive'],
  [/\b(interview)\b/i, 'interview'],
  [/\b(office|work|meeting|conference|presentation|corporate)\b/i, 'office'],
  [/\b(date|dinner|anniversary)\b/i, 'date-night'],
  [/\b(brunch|lunch|casual|coffee|day out|shopping|college)\b/i, 'brunch'],
  [/\b(party|cocktail|club|night out|birthday)\b/i, 'cocktail'],
];
export const DEFAULT_OCCASION = { formality: [2, 4], jewellery: 1 };

// ---- Scoring numbers (each component is worth 0 to 1 before weighting) ----
export const SCORING = {
  // Colour harmony
  familyBest: 1, // outfit colour is in the undertone's "suits you" list
  familyCareful: 0.4, // in the "wear with care" list
  familyOther: 0.65, // not listed either way
  familyShare: 0.7, // colour harmony = 70% family fit + 30% contrast
  contrastSpan: 40, // contrast = 0.5 + |L* difference| / span, capped at 1 (so a 20 point gap is full marks)
  contrastGood: 20, // L* gap that earns a "stands out" note
  contrastLow: 8, // under this the outfit is close to the skin colour in lightness
  noColours: 0.6, // item whose colours could not be read
  minRuleShare: 0.25, // a colour must be at least this much of the item to be mentioned

  // Hue harmony between two colours (lipstick vs outfit, stones vs outfit): by hue-angle difference in CIELAB
  neutralChroma: 14, // below this a colour is neutral and goes with anything
  neutralScore: 0.9,
  hue: [
    { maxDiff: 35, score: 1 }, // same family of hue
    { maxDiff: 65, score: 0.8 }, // neighbours
    { maxDiff: 115, score: 0.5 }, // the awkward middle
    { maxDiff: 180, score: 0.85 }, // opposite hues read as deliberate contrast
  ],
  lipFitDeltaE: [12, 25, 40], // CIELAB distance from the nearest shade picked for the profile: great, good, fair
  lipFitScores: [1, 0.75, 0.5, 0.3],

  // Occasion fit: score by how far the formality is outside the wanted range (0, 1, 2, 3+ steps)
  formalityByDistance: [1, 0.6, 0.25, 0],
  tagMatch: 1, tagUntagged: 0.6, tagOther: 0.2,
  occasionParts: { outfitFormality: 0.5, outfitTag: 0.2, jewelleryFormality: 0.2, jewelleryCount: 0.1 },
  noJewelleryFormality: 0.5,

  // Metal tone
  metalPrimary: 1, metalSecondary: 0.75, metalOxidised: 0.6, metalOther: 0.35,
  metalPrefMatch: 1, metalPrefMiss: 0.1,
  metalMixedFactor: 0.8, // necklace and earrings in different metals
  metalNone: 0.5,

  // Preferences
  avoidSecondaryPenalty: 0.4, // per avoided colour that is a minor part of the outfit
  silhouetteMatch: 1, silhouetteMiss: 0.3,
  styleMatch: 1, styleFusion: 0.8, styleMiss: 0.4,
  noPreference: 0.85,
  primaryShare: 0.4, // a colour at least this much of the outfit counts as its main colour for "colours to avoid"
};

// Jewellery colours that are just the metal, not stones
export const METAL_FAMILIES = {
  gold: ['champagne', 'mustard', 'saffron', 'camel'],
  silver: ['grey', 'ivory'],
  oxidised: ['grey', 'ivory', 'black'],
  'rose-gold': ['blush', 'peach', 'rose'],
};

export const TRADITIONAL_SILHOUETTES = ['saree', 'lehenga', 'kurta-set'];
export const CONTEMPORARY_SILHOUETTES = ['dress', 'western'];

// ---- Search ----
export const SEARCH = {
  looks: 3,
  topPerSlot: 8, // per jewellery slot, plus the cheapest few so a tight budget still has options
  cheapestExtra: 2,
  topLipsticks: 6,
  askBonus: 10, // when choosing which looks to show, an outfit matching something the shopper asked for (a chosen style, a requested colour) counts this many points extra. Never added to the shown score.
  diversityPenalty: { sameFamily: 6, sameSilhouette: 4 }, // points taken off when choosing the 2nd and 3rd look, never from the shown score
  formalityDistance: 1, // outfits further than this many steps from the wanted formality are not considered...
  relaxedFormalityDistances: [2, 3], // ...unless there are not enough looks, in which case it widens step by step and says so
};
