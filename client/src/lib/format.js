export const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
export const TYPE_LABEL = { outfit: 'Outfit', necklace: 'Necklace', earrings: 'Earrings', lipstick: 'Lipstick' };
export const METAL_LABEL = { gold: 'Gold', silver: 'Silver', 'rose-gold': 'Rose gold', oxidised: 'Oxidised' };
export const FAMILY_LABEL = (id) => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
