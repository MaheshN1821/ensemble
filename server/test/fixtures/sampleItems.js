/**
 * Test fixture only: 30 invented items (12 outfits, 6 necklaces, 6 earrings, 6 lipsticks) the planner, agent and render
 * tests run against. This is NOT the catalog the app ships with (that is src/data/seedCatalog.json) and it has no images.
 */
import { COLOUR_FAMILIES } from '../../src/config/skin.js';
import { familyOf, explicitColours } from '../../src/services/catalog/colours.js';

export const FIXTURE_CATALOG_ID = 'main';

const fam = (...ids) => explicitColours(ids).colours;
const hexOnly = (hex) => [{ hex, family: familyOf(hex), share: 1 }];

// [id, name, price, garmentCategory, silhouette, style, formality, occasions, colours, prompt]
const OUTFITS = [
  ['outfit-maroon-silk-saree', 'Maroon silk saree with zari border', 14500, 'full_body', 'saree', 'traditional', 5, ['wedding-guest', 'festive'], fam('maroon', 'champagne'), 'a maroon silk saree with a gold zari border, draped on a mannequin, plain white studio background'],
  ['outfit-emerald-lehenga', 'Emerald embroidered lehenga set', 28500, 'full_body', 'lehenga', 'traditional', 5, ['wedding-guest', 'sangeet-mehendi'], fam('emerald', 'champagne'), 'an emerald green embroidered lehenga set with gold thread work, on a mannequin, plain white background'],
  ['outfit-blush-lehenga', 'Blush pink lehenga set', 22000, 'full_body', 'lehenga', 'traditional', 4, ['sangeet-mehendi', 'wedding-guest'], fam('blush', 'champagne'), 'a blush pink lehenga set with light sequin work, on a mannequin, plain white background'],
  ['outfit-royal-blue-saree', 'Royal blue silk saree', 11800, 'full_body', 'saree', 'traditional', 5, ['wedding-guest', 'festive'], fam('royal-blue', 'champagne'), 'a royal blue silk saree with a thin gold border, on a mannequin, plain white background'],
  ['outfit-mustard-kurta', 'Mustard cotton kurta set', 3800, 'full_body', 'kurta-set', 'traditional', 2, ['festive', 'sangeet-mehendi', 'brunch'], fam('mustard', 'ivory'), 'a mustard yellow cotton kurta set with white palazzo trousers, on a mannequin, plain white background'],
  ['outfit-ivory-kurta', 'Ivory cotton kurta set', 2400, 'full_body', 'kurta-set', 'traditional', 3, ['festive', 'office', 'brunch'], fam('ivory'), 'an ivory cotton kurta set with subtle self-embroidery, on a mannequin, plain white background'],
  ['outfit-olive-fusion-kurta', 'Olive kurta with palazzo', 4600, 'full_body', 'kurta-set', 'fusion', 3, ['festive', 'office', 'brunch'], fam('olive-green', 'camel'), 'an olive green long kurta with camel palazzo trousers, on a mannequin, plain white background'],
  ['outfit-teal-georgette-saree', 'Teal georgette saree', 6800, 'full_body', 'saree', 'fusion', 3, ['festive', 'office', 'cocktail'], fam('teal', 'champagne'), 'a teal georgette saree with a slim champagne border, on a mannequin, plain white background'],
  ['outfit-navy-wrap-dress', 'Navy wrap dress', 4200, 'full_body', 'dress', 'contemporary', 3, ['office', 'date-night', 'brunch'], fam('navy'), 'a navy blue knee-length wrap dress, on a mannequin, plain white background'],
  ['outfit-coral-midi-dress', 'Coral midi dress', 3500, 'full_body', 'dress', 'contemporary', 2, ['brunch', 'date-night'], fam('coral'), 'a coral midi dress with short sleeves, on a mannequin, plain white background'],
  ['outfit-rose-gown', 'Rose evening gown', 12500, 'full_body', 'dress', 'contemporary', 4, ['cocktail', 'date-night', 'wedding-guest'], fam('rose'), 'a dusty rose satin evening gown, on a mannequin, plain white background'],
  ['outfit-black-blazer', 'Black structured blazer', 6400, 'upper_body', 'western', 'contemporary', 4, ['office', 'interview', 'cocktail'], fam('black'), 'a black structured women\'s blazer, on a mannequin torso, plain white background'],
];

// [id, name, price, metalTone, style, formality, occasions, colours, prompt]
const NECKLACES = [
  ['necklace-gold-kundan', 'Gold kundan necklace with emerald drops', 8400, 'gold', 'traditional', 5, ['wedding-guest', 'sangeet-mehendi', 'festive'], fam('champagne', 'emerald'), 'a gold kundan necklace with small emerald green drops, product photo, plain white background'],
  ['necklace-gold-temple', 'Gold temple necklace', 6200, 'gold', 'traditional', 5, ['wedding-guest', 'festive'], fam('champagne', 'maroon'), 'a gold temple jewellery necklace with maroon stones, product photo, plain white background'],
  ['necklace-oxidised-choker', 'Oxidised silver choker', 1800, 'oxidised', 'traditional', 3, ['festive', 'sangeet-mehendi', 'brunch'], fam('grey'), 'an oxidised silver choker necklace, product photo, plain white background'],
  ['necklace-rose-gold-pendant', 'Rose gold solitaire pendant', 2900, 'rose-gold', 'contemporary', 2, ['office', 'date-night', 'brunch', 'interview'], fam('blush'), 'a delicate rose gold chain with a small round solitaire pendant, product photo, plain white background'],
  ['necklace-silver-layered', 'Silver layered chain', 2200, 'silver', 'contemporary', 2, ['office', 'brunch', 'interview', 'cocktail'], fam('grey'), 'a silver two-layer chain necklace, product photo, plain white background'],
  ['necklace-pearl-gold', 'Pearl and gold necklace', 4800, 'gold', 'fusion', 4, ['wedding-guest', 'festive', 'cocktail', 'date-night'], fam('ivory', 'champagne'), 'a single strand pearl necklace with gold spacers, product photo, plain white background'],
];

const EARRINGS = [
  ['earrings-gold-jhumka', 'Gold jhumka earrings', 3200, 'gold', 'traditional', 5, ['wedding-guest', 'festive', 'sangeet-mehendi'], fam('champagne'), 'a pair of gold jhumka earrings, product photo, plain white background'],
  ['earrings-kundan-drop', 'Kundan drop earrings', 4500, 'gold', 'traditional', 4, ['wedding-guest', 'sangeet-mehendi', 'festive'], fam('champagne', 'emerald'), 'a pair of gold kundan drop earrings with emerald beads, product photo, plain white background'],
  ['earrings-oxidised-chandbali', 'Oxidised chandbali earrings', 1600, 'oxidised', 'traditional', 3, ['festive', 'sangeet-mehendi', 'brunch'], fam('grey'), 'a pair of oxidised silver chandbali earrings, product photo, plain white background'],
  ['earrings-silver-studs', 'Silver stud earrings', 900, 'silver', 'contemporary', 2, ['office', 'interview', 'brunch', 'date-night'], fam('grey'), 'a pair of small round silver stud earrings, product photo, plain white background'],
  ['earrings-rose-gold-hoops', 'Rose gold hoop earrings', 1500, 'rose-gold', 'contemporary', 2, ['brunch', 'date-night', 'office', 'cocktail'], fam('blush'), 'a pair of rose gold hoop earrings, product photo, plain white background'],
  ['earrings-pearl-drop', 'Pearl drop earrings', 2400, 'gold', 'fusion', 4, ['wedding-guest', 'cocktail', 'date-night', 'festive'], fam('ivory', 'champagne'), 'a pair of pearl drop earrings with gold caps, product photo, plain white background'],
];

// Shades are the mid-depth hexes of the Stage 3 lipstick families, so profile.palette.lips line up with real items.
const LIPSTICKS = [
  ['lipstick-coral', 'Sample coral lipstick', 450, '#E26A55'],
  ['lipstick-brick', 'Sample brick lipstick', 520, '#A03F2E'],
  ['lipstick-rosewood', 'Sample rosewood lipstick', 480, '#AA5659'],
  ['lipstick-berry', 'Sample berry lipstick', 520, '#992A5E'],
  ['lipstick-classic-red', 'Sample classic red lipstick', 600, '#B82A38'],
  ['lipstick-dusty-mauve', 'Sample dusty mauve lipstick', 480, '#AC7084'],
];

const IMG = (id) => `https://img.test/${id}.png`;
const common = { productUrl: null, colourSource: 'merchant' };

export const SAMPLE_ITEMS = [
  ...OUTFITS.map(([id, name, price, garmentCategory, silhouette, style, formality, occasions, colours, prompt]) => ({
    ...common, itemId: id, type: 'outfit', name, price, imageUrl: IMG(id), garmentCategory, silhouette, style, formality, occasions, colours, metalTone: null, prompt,
  })),
  ...NECKLACES.map(([id, name, price, metalTone, style, formality, occasions, colours, prompt]) => ({
    ...common, itemId: id, type: 'necklace', name, price, imageUrl: IMG(id), garmentCategory: null, silhouette: null, style, formality, occasions, colours, metalTone, prompt,
  })),
  ...EARRINGS.map(([id, name, price, metalTone, style, formality, occasions, colours, prompt]) => ({
    ...common, itemId: id, type: 'earrings', name, price, imageUrl: IMG(id), garmentCategory: null, silhouette: null, style, formality, occasions, colours, metalTone, prompt,
  })),
  ...LIPSTICKS.map(([id, name, price, hex]) => ({
    ...common, itemId: id, type: 'lipstick', name, price, imageUrl: IMG(id), garmentCategory: null, silhouette: null, style: null, formality: 3, occasions: [], colours: hexOnly(hex), metalTone: null,
    prompt: `a lipstick bullet in a ${name.replace('Sample ', '').replace(' lipstick', '')} shade beside a small swatch, product photo, plain white background`,
  })),
];

// Catch typos in this file at import time rather than as a broken planner later.
for (const it of SAMPLE_ITEMS) {
  for (const c of it.colours) if (!COLOUR_FAMILIES[c.family]) throw new Error(`Sample item ${it.itemId} has an unknown colour family ${c.family}`);
}
