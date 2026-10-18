/**
 * Everything the catalog decides with, in one place. Edit limits and rules here only.
 * The client reads the public part from GET /api/catalog/config so forms and server checks cannot drift apart.
 */
import { OCCASIONS, METALS } from './intake.js';

export const ITEM_TYPES = [
  { id: 'outfit', label: 'Outfit' },
  { id: 'necklace', label: 'Necklace' },
  { id: 'earrings', label: 'Earrings' },
  { id: 'lipstick', label: 'Lipstick' },
];

// Garment categories supported by the clothes try-on (FR-11). Only outfits carry one.
export const GARMENT_CATEGORIES = [
  { id: 'full_body', label: 'Full body' },
  { id: 'upper_body', label: 'Upper body' },
  { id: 'lower_body', label: 'Lower body' },
  { id: 'outerwear', label: 'Outerwear' },
];

// Metal tones for jewellery. Intake's "any" is a preference value, not a metal.
export const METAL_TONES = [...METALS.filter((m) => m.id !== 'any'), { id: 'oxidised', label: 'Oxidised' }];

export const STYLES = [
  { id: 'traditional', label: 'Traditional' },
  { id: 'contemporary', label: 'Contemporary' },
  { id: 'fusion', label: 'Fusion' },
];

export const SOURCES = ['sample', 'merchant'];

export const LIMITS = {
  maxRowsPerImport: 60, // each row means one image download, so keep one request well under a minute
  maxItemsPerCatalog: 200,
  maxFileBytes: 512 * 1024, // the CSV/JSON text itself
  maxImageBytes: 8 * 1024 * 1024,
  imageTimeoutMs: 8000,
  imageConcurrency: 6,
  maxRedirects: 3,
  nameMax: 80,
  catalogNameMax: 60,
  maxOccasionTags: 8,
  maxColours: 3,
  price: { min: 50, max: 1_000_000 }, // rupees
  catalogTtlDays: 30, // merchant catalogs are temporary too; the sample catalog never expires
};

// Image checks per item type (FR-14). `min*` failures reject the row, the rest only warn.
export const IMAGE_RULES = {
  outfit: { minShortSide: 400, minLongSide: 500, minAspect: 0.8, note: 'a front-facing garment photo (flat lay, mannequin or model) at least 400 px wide' },
  necklace: { minShortSide: 200, minLongSide: 200, minAspect: null, note: 'a clear photo of the necklace on a plain background' },
  earrings: { minShortSide: 200, minLongSide: 200, minAspect: null, note: 'a clear photo of the earrings on a plain background' },
  lipstick: { minShortSide: 100, minLongSide: 100, minAspect: null, note: 'a photo of the lipstick or a swatch of the shade' },
};

export const COLOUR_RULES = {
  keep: 3, // colours stored per item
  minShare: 0.08, // a colour under 8% of the item is noise
  backgroundMaxChroma: 6, // near-white, almost colourless pixels are background. Ivory (chroma ~10) is a real garment colour and stays.
  backgroundMinLightness: 88,
  backgroundUniformDeltaE: 7, // pixels this close to a plain border colour count as background. Ivory on white is ~12 apart, so it survives.
  sampleStep: 3, // read every 3rd pixel when decoding locally
  minGarmentShare: 0.03, // if background removal leaves under 3% of the pixels, the item is itself background-coloured, so keep everything
};

export const defaultsFor = (type) => ({
  garmentCategory: type === 'outfit' ? 'full_body' : null,
});

export const occasionIds = OCCASIONS.map((o) => o.id);

export const publicCatalogConfig = () => ({
  itemTypes: ITEM_TYPES,
  garmentCategories: GARMENT_CATEGORIES,
  metalTones: METAL_TONES,
  styles: STYLES,
  occasions: OCCASIONS,
  limits: {
    maxRowsPerImport: LIMITS.maxRowsPerImport,
    maxItemsPerCatalog: LIMITS.maxItemsPerCatalog,
    maxFileBytes: LIMITS.maxFileBytes,
    price: LIMITS.price,
    catalogTtlDays: LIMITS.catalogTtlDays,
  },
  imageRules: Object.fromEntries(Object.entries(IMAGE_RULES).map(([k, v]) => [k, { minShortSide: v.minShortSide, note: v.note }])),
});
