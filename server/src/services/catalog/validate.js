import {
  GARMENT_CATEGORIES, ITEM_TYPES, LIMITS, METAL_TONES, STYLES, occasionIds,
} from '../../config/catalog.js';
import { explicitColours } from './colours.js';

const ids = (list) => list.map((x) => x.id);
const clean = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const slug = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const norm = (s) => clean(s).toLowerCase().replace(/[\s-]+/g, '_');

// Header and value spellings retailers actually use, mapped to our fields.
const HEADER_ALIASES = {
  id: ['id', 'sku', 'item_id', 'itemid', 'product_id'],
  type: ['type', 'item_type', 'kind', 'product_type'],
  gender: ['gender', 'target', 'department', 'for', 'sex'],
  category: ['outfit_category', 'category', 'subcategory', 'collection'],
  name: ['name', 'title', 'product_name'],
  price: ['price', 'price_inr', 'price_rs', 'mrp', 'amount'],
  imageUrl: ['image_url', 'imageurl', 'image', 'image_link', 'img', 'photo'],
  garmentCategory: ['garment_category', 'garmentcategory', 'garment'],
  colours: ['colours', 'colors', 'colour', 'color', 'dominant_colours', 'dominant_colors'],
  metalTone: ['metal_tone', 'metal', 'metaltone', 'tone'],
  formality: ['formality', 'formality_level'],
  occasions: ['occasion_tags', 'occasions', 'occasion', 'tags'],
  productUrl: ['product_url', 'url', 'link', 'producturl', 'product_link'],
  style: ['style', 'leaning'],
  silhouette: ['silhouette', 'garment_type'],
};
const TYPE_ALIASES = {
  dress: 'outfit', saree: 'outfit', sari: 'outfit', lehenga: 'outfit', kurta: 'outfit',
  clothing: 'outfit', garment: 'outfit', outfits: 'outfit', suit: 'outfit', shirt: 'outfit',
  blazer: 'outfit', top: 'outfit', apparel: 'outfit',
  earring: 'earrings', jhumka: 'earrings', studs: 'earrings',
  lipsticks: 'lipstick', lip: 'lipstick', makeup: 'lipstick',
  eyewear: 'eyewear', glasses: 'eyewear', sunglasses: 'eyewear', shades: 'eyewear', frames: 'eyewear',
  watch: 'watch', watches: 'watch', timepiece: 'watch', bracelet: 'watch', wristwear: 'watch',
  blush: 'blush', rouge: 'blush',
  foundation: 'foundation', base: 'foundation', compact: 'foundation', bb_cream: 'foundation', 'skin-smooth': 'foundation',
};
const GENDER_ALIASES = {
  women: 'women', woman: 'women', female: 'women', ladies: 'women',
  men: 'men', man: 'men', male: 'men', gents: 'men',
  unisex: 'unisex', all: 'unisex', both: 'unisex',
};
const OUTFIT_CAT_ALIASES = {
  saree: 'saree', sari: 'saree', ethnic: 'saree',
  party: 'party', partywear: 'party', party_wear: 'party', evening: 'party',
  casual: 'casual', daily: 'casual', streetwear: 'casual',
  formal: 'formal', office: 'formal', work: 'formal', suit: 'formal',
  festive: 'festive', wedding: 'festive', celebration: 'festive',
};
const CATEGORY_ALIASES = { full: 'full_body', fullbody: 'full_body', full_body: 'full_body', dress: 'full_body', upper: 'upper_body', top: 'upper_body', upper_body: 'upper_body', lower: 'lower_body', bottom: 'lower_body', lower_body: 'lower_body', jacket: 'outerwear', outerwear: 'outerwear' };
const METAL_ALIASES = { gold: 'gold', golden: 'gold', silver: 'silver', rose_gold: 'rose-gold', rosegold: 'rose-gold', oxidised: 'oxidised', oxidized: 'oxidised', antique: 'oxidised', steel: 'silver', black: 'oxidised', platinum: 'silver' };
export const SILHOUETTE_IDS = ['saree', 'lehenga', 'kurta-set', 'dress', 'western', 'suit', 'casual-shirt'];

/** Maps a raw row (CSV object or JSON object) onto our field names, tolerant of common header spellings. */
export function canonicalRow(raw) {
  const lowered = {};
  for (const [k, v] of Object.entries(raw)) if (k !== '__line') lowered[norm(k)] = v;
  const out = { __line: raw.__line };
  const unknown = new Set(Object.keys(lowered));
  for (const [field, names] of Object.entries(HEADER_ALIASES)) {
    const hit = names.find((n) => n in lowered);
    if (hit !== undefined) { out[field] = lowered[hit]; for (const n of names) unknown.delete(n); }
  }
  out.__unknown = [...unknown];
  return out;
}

const asList = (v) => (Array.isArray(v) ? v.map(clean) : String(v ?? '').split(/[|;,]/).map(clean)).filter(Boolean);
const err = (field, message) => ({ field, message });

/**
 * Validates and normalises one row. Returns { item, errors, warnings }. `item` is null when there is any error.
 * Pure: no network. Image checks happen later in the importer.
 */
export function validateRow(raw, { index = 0 } = {}) {
  const r = canonicalRow(raw);
  const errors = [];
  const warnings = [];

  const name = clean(r.name);
  if (!name) errors.push(err('name', 'Add a name for this item.'));
  else if (name.length > LIMITS.nameMax) errors.push(err('name', `Keep the name under ${LIMITS.nameMax} characters.`));

  const typeKey = norm(r.type);
  const type = ids(ITEM_TYPES).includes(typeKey) ? typeKey : TYPE_ALIASES[typeKey];
  if (!type) errors.push(err('type', r.type ? `"${clean(r.type)}" is not a type we know. Use outfit, earrings, lipstick, eyewear or watch.` : 'Add a type: outfit, earrings, lipstick, eyewear or watch.'));

  const genderKey = norm(r.gender);
  const gender = genderKey ? (GENDER_ALIASES[genderKey] ?? 'unisex') : 'unisex';

  let category = null;
  if (r.category) {
    const catKey = norm(r.category);
    category = OUTFIT_CAT_ALIASES[catKey] ?? slug(r.category);
  } else if (type === 'outfit' && r.silhouette) {
    category = OUTFIT_CAT_ALIASES[norm(r.silhouette)] ?? null;
  }

  const priceText = String(r.price ?? '').replace(/[₹,\s]|rs\.?|inr/gi, '');
  const price = priceText === '' ? NaN : Number(priceText);
  if (!Number.isFinite(price)) errors.push(err('price', 'Add a price in rupees, for example 4999.'));
  else if (!Number.isInteger(price)) errors.push(err('price', 'Use a whole number of rupees, for example 4999.'));
  else if (price < LIMITS.price.min || price > LIMITS.price.max) errors.push(err('price', `The price should be between ₹${LIMITS.price.min} and ₹${LIMITS.price.max.toLocaleString('en-IN')}.`));

  const imageUrl = clean(r.imageUrl);
  if (!imageUrl) errors.push(err('image_url', 'Add a link to the item photo.'));
  else {
    try {
      const u = new URL(imageUrl);
      if (u.protocol !== 'https:') errors.push(err('image_url', 'Image links must start with https://.'));
    } catch { errors.push(err('image_url', 'That image link is not a valid web address.')); }
  }

  let productUrl = clean(r.productUrl);
  if (productUrl) {
    try { const u = new URL(productUrl); if (!/^https?:$/.test(u.protocol)) throw new Error(); productUrl = u.toString(); } catch { errors.push(err('product_url', 'The product link is not a valid web address.')); }
  } else productUrl = null;

  let garmentCategory = null;
  if (type === 'outfit') {
    const key = norm(r.garmentCategory);
    garmentCategory = key ? (CATEGORY_ALIASES[key] ?? (ids(GARMENT_CATEGORIES).includes(key) ? key : undefined)) : 'full_body';
    if (!garmentCategory) { errors.push(err('garment_category', `"${clean(r.garmentCategory)}" is not a category. Use full body, upper body, lower body or outerwear.`)); garmentCategory = null; }
    else if (!key) warnings.push({ field: 'garment_category', message: 'No garment category given, so this is treated as a full-body outfit.' });
  }

  let metalTone = null;
  if (type === 'earrings' || type === 'watch') {
    const key = norm(r.metalTone);
    if (!key) {
      if (type === 'earrings') errors.push(err('metal_tone', 'Add the metal tone: gold, silver, rose gold or oxidised.'));
    } else if (METAL_ALIASES[key]) metalTone = METAL_ALIASES[key];
    else if (type === 'earrings') errors.push(err('metal_tone', `"${clean(r.metalTone)}" is not a metal tone. Use gold, silver, rose gold or oxidised.`));
  }
  const isMakeupType = ['lipstick', 'blush', 'foundation'].includes(type);

  let formality = null;
  if (String(r.formality ?? '').trim() === '') {
    if (!isMakeupType && type !== 'eyewear') errors.push(err('formality', 'Add a formality from 1 (casual) to 5 (very formal).'));
    else formality = 3;
  } else {
    const f = Number(r.formality);
    if (!Number.isInteger(f) || f < 1 || f > 5) errors.push(err('formality', 'Formality must be a whole number from 1 (casual) to 5 (very formal).'));
    else formality = f;
  }

  let occasions = [];
  const tags = asList(r.occasions).map((t) => slug(t));
  if (tags.length) {
    const bad = tags.filter((t) => !occasionIds.includes(t));
    if (bad.length) errors.push(err('occasion_tags', `Unknown occasion ${bad.map((b) => `"${b}"`).join(', ')}. Use: ${occasionIds.join(', ')}.`));
    else occasions = [...new Set(tags)].slice(0, LIMITS.maxOccasionTags);
  } else if (!isMakeupType && type !== 'eyewear') warnings.push({ field: 'occasion_tags', message: 'No occasion tags, so this item is matched on formality alone.' });

  let style = null;
  if (String(r.style ?? '').trim()) {
    const s = norm(r.style);
    if (ids(STYLES).includes(s)) style = s;
    else errors.push(err('style', 'Style must be traditional, contemporary, fusion, casual or formal.'));
  }

  let silhouette = null;
  if (type === 'outfit' && String(r.silhouette ?? '').trim()) {
    const s = slug(r.silhouette);
    if (SILHOUETTE_IDS.includes(s)) silhouette = s;
    else warnings.push({ field: 'silhouette', message: `"${clean(r.silhouette)}" is not one of ${SILHOUETTE_IDS.join(', ')}, so shoppers cannot filter by it.` });
  }

  // Colours: explicit wins; otherwise extracted from the image later (colourSource 'image').
  let explicit = null;
  const colourTokens = asList(r.colours);
  if (colourTokens.length) {
    const res = explicitColours(colourTokens);
    if (res.error) errors.push(err('colours', `Could not read the colour ${res.error.map((e) => `"${e}"`).join(', ')}. Use a name such as maroon or a hex such as #6E1A2D.`));
    else explicit = res.colours;
  } else if (isMakeupType) {
    warnings.push({ field: 'colours', message: 'No colour hex or name provided. Adding an explicit colour (e.g. #DE6B7E) ensures the virtual try-on applies your exact shade.' });
  }

  const idRaw = clean(r.id);
  const id = slug(idRaw) || (name ? `${type ?? 'item'}-${slug(name)}`.slice(0, 60) : `row-${index + 1}`);
  if (idRaw && id.length > 60) errors.push(err('id', 'Keep the id under 60 characters.'));
  if (r.__unknown?.length) warnings.push({ field: r.__unknown.join(', '), message: `Ignored unrecognised column${r.__unknown.length > 1 ? 's' : ''}: ${r.__unknown.join(', ')}.` });

  if (errors.length) return { item: null, errors, warnings };
  return {
    item: {
      itemId: id,
      type,
      gender,
      category,
      name,
      price,
      imageUrl,
      garmentCategory,
      colours: explicit ?? [],
      colourSource: explicit ? 'merchant' : 'pending',
      metalTone,
      formality,
      occasions,
      productUrl,
      style,
      silhouette,
    },
    errors: [],
    warnings,
  };
}
