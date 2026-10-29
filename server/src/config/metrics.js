// What the retailer view counts and how it reads. Counts only: no photos, no IP addresses, no skin data, no free text.

/** Plain-language names for the refinement operations (the agent's OPS). Anything else is filed under "other". */
export const REFINEMENT_LABELS = {
  swap_item: 'Swapped an item',
  change_formality: 'Changed how formal the look is',
  change_colour_family: 'Changed the colour family',
  change_budget: 'Changed the budget',
  exclude_item: 'Asked never to see an item again',
  remove_item: 'Removed a piece of jewellery',
  change_metal: 'Changed the metal tone',
  change_lipstick: 'Changed the lipstick shade',
  make_cheaper: 'Asked for something cheaper',
  unsupported: 'Asked for something the catalog cannot do',
  other: 'Other',
};

export const MAIN_STATS_ID = 'main'; // the shared catalog's counters
export const TOP_ITEMS_SHOWN = 10;

export const STATS_NOTE =
  'These are anonymous counts from real sessions. They never include photos, skin readings, names or network addresses.';

// Item ids come from retailers. Mongo field names cannot hold "." or start with "$", so ids are encoded in counter keys.
export const encodeKey = (id) => encodeURIComponent(String(id)).replace(/\./g, '%2E').slice(0, 120);
export const decodeKey = (key) => {
  try { return decodeURIComponent(key); } catch { return key; }
};
