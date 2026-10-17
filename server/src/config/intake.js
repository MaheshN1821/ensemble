/**
 * Single source of truth for intake rules. The client reads these from GET /api/intake/config
 * so the browser checks and the server checks can never drift apart.
 */
export const CONSENT_VERSION = '2026-10-17';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// Open decision from Stage 2 scope: minimum resolution. Chosen to keep faces and garments sharp enough for
// try-on while accepting any modern phone photo. Change here only.
export const PHOTO_RULES = {
  selfie: { minShortSide: 480, minLongSide: 480, mustBePortrait: false, label: 'Selfie' },
  body: { minShortSide: 600, minLongSide: 1000, mustBePortrait: true, label: 'Full-length photo' },
};

export const OCCASIONS = [
  { id: 'wedding-guest', label: 'Wedding guest' },
  { id: 'sangeet-mehendi', label: 'Sangeet or mehendi' },
  { id: 'festive', label: 'Festival or puja' },
  { id: 'office', label: 'Office or work event' },
  { id: 'interview', label: 'Interview' },
  { id: 'date-night', label: 'Date night' },
  { id: 'brunch', label: 'Brunch or day out' },
  { id: 'cocktail', label: 'Cocktail or party' },
];

export const SILHOUETTES = [
  { id: 'saree', label: 'Saree' },
  { id: 'lehenga', label: 'Lehenga' },
  { id: 'kurta-set', label: 'Kurta set' },
  { id: 'dress', label: 'Dress' },
  { id: 'western', label: 'Top and trousers' },
];

export const METALS = [
  { id: 'any', label: 'No preference' },
  { id: 'gold', label: 'Gold' },
  { id: 'silver', label: 'Silver' },
  { id: 'rose-gold', label: 'Rose gold' },
];

export const AVOID_COLOURS = [
  { id: 'black', label: 'Black' },
  { id: 'white', label: 'White' },
  { id: 'red', label: 'Red' },
  { id: 'pink', label: 'Pink' },
  { id: 'yellow', label: 'Yellow' },
  { id: 'green', label: 'Green' },
  { id: 'blue', label: 'Blue' },
  { id: 'orange', label: 'Orange' },
];

export const BUDGET = { min: 2000, max: 300000, step: 500, default: 25000 };
export const NOTES_MAX = 200;
export const OCCASION_TEXT_MAX = 120;

// Placeholder sample models. Replace the JPGs in client/public/samples/<id>/ with labelled AI-generated images.
export const SAMPLE_MODELS = [
  { id: 'sample-a', label: 'Sample model A' },
  { id: 'sample-b', label: 'Sample model B' },
];

export const publicIntakeConfig = () => ({
  consentVersion: CONSENT_VERSION,
  maxPhotoBytes: MAX_PHOTO_BYTES,
  photoRules: PHOTO_RULES,
  occasions: OCCASIONS,
  silhouettes: SILHOUETTES,
  metals: METALS,
  avoidColours: AVOID_COLOURS,
  budget: BUDGET,
  notesMax: NOTES_MAX,
  occasionTextMax: OCCASION_TEXT_MAX,
  sampleModels: SAMPLE_MODELS.map((m) => ({
    ...m,
    selfieUrl: `/samples/${m.id}/selfie.jpg`,
    bodyUrl: `/samples/${m.id}/body.jpg`,
  })),
});
