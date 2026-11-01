export const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
export const TYPE_LABEL = {
  outfit: 'Outfit',
  earrings: 'Earrings',
  lipstick: 'Lipstick',
  blush: 'Blush',
  foundation: 'Foundation',
  eyewear: 'Eyewear',
  watch: 'Watch',
};
export const GENDER_LABEL = {
  all: 'All',
  women: 'Women',
  men: 'Men',
  unisex: 'Unisex',
};
export const OUTFIT_CATEGORY_LABEL = {
  all: 'All Outfits',
  casual: 'Casual',
  party: 'Party Wear',
  saree: 'Saree',
  formal: 'Formal',
  festive: 'Festive',
};
export const METAL_LABEL = { gold: 'Gold', silver: 'Silver', 'rose-gold': 'Rose gold', oxidised: 'Oxidised' };
export const FAMILY_LABEL = (id) => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
