/**
 * Everything the skin tone profile decides with, in one place. Edit thresholds and palettes here only.
 *
 * The thresholds are STARTING VALUES taken from published skin-colour ranges (ITA classes from Chardon et al.,
 * hue-angle ranges from skin colorimetry studies). They have not yet been tuned on live YouCam results.
 * Tune them after the first real runs (see CONTEXT.md, item 2).
 */

// ---- Depth: from the Individual Typology Angle, ITA = atan((L* - 50) / b*) in degrees. Higher = lighter. ----
export const DEPTHS = [
  { id: 'very-light', label: 'Very light', minIta: 55 },
  { id: 'light', label: 'Light', minIta: 41 },
  { id: 'medium', label: 'Medium', minIta: 28 },
  { id: 'tan', label: 'Tan', minIta: 10 },
  { id: 'deep', label: 'Deep', minIta: -30 },
  { id: 'very-deep', label: 'Very deep', minIta: -Infinity },
];

// ---- Undertone: from the hue angle of skin colour in CIELAB (h* = atan2(b*, a*)) and its chroma ----
export const UNDERTONES = [
  { id: 'warm', label: 'Warm', blurb: 'A golden or peachy cast.' },
  { id: 'cool', label: 'Cool', blurb: 'A pink or rosy cast.' },
  { id: 'neutral', label: 'Neutral', blurb: 'A balance of golden and rosy.' },
  { id: 'olive', label: 'Olive', blurb: 'A muted, slightly green-gold cast.' },
];

export const UNDERTONE_RULES = {
  coolBelowHue: 52, // h* below this reads rosy
  warmFromHue: 58, // h* at or above this reads golden
  oliveFromHue: 60, // olive needs a golden hue ...
  oliveMaxChroma: 22, // ... with muted chroma
  oliveMaxLightness: 75, // very pale skin is naturally low in chroma, so it is not read as olive
  // Distance (in degrees of hue, or chroma units for olive) from the nearest boundary.
  highMargin: 4,
  mediumMargin: 2,
};

// ---- Colour families. `group` links a family to the "colours to avoid" choices from intake (null = not avoidable). ----
export const COLOUR_FAMILIES = {
  ivory: { label: 'Ivory', hex: '#F3EBD9', group: 'white' },
  champagne: { label: 'Champagne', hex: '#E6CFA0', group: null },
  blush: { label: 'Blush', hex: '#F2CBC9', group: 'pink' },
  peach: { label: 'Peach', hex: '#F4B79A', group: 'orange' },
  coral: { label: 'Coral', hex: '#EE7B6A', group: 'orange' },
  saffron: { label: 'Saffron', hex: '#E88B1A', group: 'orange' },
  mustard: { label: 'Mustard', hex: '#D4A017', group: 'yellow' },
  rose: { label: 'Rose', hex: '#D9718A', group: 'pink' },
  magenta: { label: 'Magenta', hex: '#B8227A', group: 'pink' },
  berry: { label: 'Berry', hex: '#8E2A5B', group: 'pink' },
  red: { label: 'True red', hex: '#C21F2F', group: 'red' },
  maroon: { label: 'Maroon', hex: '#6E1A2D', group: 'red' },
  plum: { label: 'Plum', hex: '#5E2A5E', group: null },
  mauve: { label: 'Mauve', hex: '#A9779B', group: null },
  lilac: { label: 'Lilac', hex: '#C2B2E0', group: null },
  navy: { label: 'Navy', hex: '#1B2A5C', group: 'blue' },
  'royal-blue': { label: 'Royal blue', hex: '#2748B5', group: 'blue' },
  'powder-blue': { label: 'Powder blue', hex: '#A9C7E8', group: 'blue' },
  teal: { label: 'Teal', hex: '#12787A', group: 'blue' },
  emerald: { label: 'Emerald', hex: '#0E7A57', group: 'green' },
  'olive-green': { label: 'Olive green', hex: '#6B7A33', group: 'green' },
  mint: { label: 'Mint', hex: '#A8D8C0', group: 'green' },
  camel: { label: 'Camel', hex: '#B98A5B', group: null },
  black: { label: 'Black', hex: '#1A1A1F', group: 'black' },
  // Added in Stage 4 so catalog colours always land on a family. Not in any palette, so the planner scores them as neutral.
  grey: { label: 'Grey', hex: '#8A8A92', group: null },
  brown: { label: 'Brown', hex: '#6B4A35', group: null },
};

// Per undertone: families that suit, and families to wear with care (still allowed, just not led with).
export const PALETTES = {
  warm: {
    best: ['coral', 'peach', 'saffron', 'mustard', 'olive-green', 'emerald', 'maroon', 'champagne'],
    careful: ['lilac', 'powder-blue', 'magenta', 'rose'],
  },
  cool: {
    best: ['rose', 'magenta', 'berry', 'navy', 'royal-blue', 'emerald', 'plum', 'lilac'],
    careful: ['mustard', 'saffron', 'peach', 'camel'],
  },
  neutral: {
    best: ['rose', 'teal', 'emerald', 'maroon', 'navy', 'mauve', 'berry', 'champagne'],
    careful: ['saffron', 'mint'],
  },
  olive: {
    best: ['maroon', 'plum', 'teal', 'berry', 'coral', 'ivory', 'peach'],
    careful: ['olive-green', 'mustard', 'mint'],
  },
};

// Pale tones can wash out very light skin. Depth only adjusts the "with care" list and the note.
export const DEPTH_NOTES = {
  'very-light': 'Soft to medium colours keep your contrast balanced. Very pale tones can wash you out.',
  light: 'Soft to medium colours keep your contrast balanced. Very pale tones can wash you out.',
  medium: 'You carry both rich and soft colours well, so tone matters more than depth.',
  tan: 'You carry both rich and soft colours well, so tone matters more than depth.',
  deep: 'Rich, saturated colours stand out strongly against your skin.',
  'very-deep': 'Rich, saturated colours stand out strongly against your skin.',
};
export const PALE_FAMILIES = ['ivory', 'champagne', 'blush', 'mint', 'powder-blue'];

// ---- Metals ----
export const METAL_BY_UNDERTONE = {
  warm: { primary: 'gold', secondary: 'rose-gold' },
  olive: { primary: 'gold', secondary: 'rose-gold' },
  cool: { primary: 'silver', secondary: 'rose-gold' },
  neutral: { primary: 'rose-gold', secondary: 'gold' },
};
export const METAL_LABELS = { gold: 'Gold', silver: 'Silver', 'rose-gold': 'Rose gold' };

// ---- Lipstick: three shade families per undertone, each with a hex per depth tier (what the try-on will apply) ----
export const LIP_TIERS = {
  'very-light': 'light', light: 'light', medium: 'medium', tan: 'medium', deep: 'deep', 'very-deep': 'deep',
};
export const LIPSTICKS = {
  warm: [
    { id: 'warm-coral', label: 'Coral', hex: { light: '#F08A78', medium: '#E26A55', deep: '#C4483A' } },
    { id: 'warm-brick', label: 'Brick', hex: { light: '#B5503C', medium: '#A03F2E', deep: '#7E2A22' } },
    { id: 'warm-nude', label: 'Terracotta nude', hex: { light: '#D9A184', medium: '#C48566', deep: '#9C5E45' } },
  ],
  cool: [
    { id: 'cool-berry', label: 'Berry', hex: { light: '#B03A6E', medium: '#992A5E', deep: '#7A1F4B' } },
    { id: 'cool-rose', label: 'Rose', hex: { light: '#D77C97', medium: '#C4607F', deep: '#A8456A' } },
    { id: 'cool-plum', label: 'Plum', hex: { light: '#8A3D68', medium: '#74295A', deep: '#561B45' } },
  ],
  neutral: [
    { id: 'neutral-rosewood', label: 'Rosewood', hex: { light: '#BF6E70', medium: '#AA5659', deep: '#8A3D42' } },
    { id: 'neutral-mauve', label: 'Dusty mauve', hex: { light: '#C48A9A', medium: '#AC7084', deep: '#8D566B' } },
    { id: 'neutral-red', label: 'Classic red', hex: { light: '#CC3A45', medium: '#B82A38', deep: '#981F2E' } },
  ],
  olive: [
    { id: 'olive-terracotta', label: 'Terracotta', hex: { light: '#CC7C62', medium: '#B8634A', deep: '#964A38' } },
    { id: 'olive-wine', label: 'Wine', hex: { light: '#8E3350', medium: '#782642', deep: '#5C1B33' } },
    { id: 'olive-spice', label: 'Spiced rose', hex: { light: '#C9788A', medium: '#B35F72', deep: '#954759' } },
  ],
};

// ---- Sample models: no photo is sent to YouCam, so their skin colour is fixed here and run through the same rules ----
export const SAMPLE_SKIN = {
  'sample-a': { hex: '#C08A5E' },
  'sample-b': { hex: '#8A6048' },
};
