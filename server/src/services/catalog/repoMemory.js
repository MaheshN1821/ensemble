/** In-memory catalog repository, same methods as the Mongo one. Used by tests and as the createApp fallback. */
const TYPE_ORDER = { outfit: 0, necklace: 1, earrings: 2, lipstick: 3 };
export const sortItems = (list) => [...list].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.price - b.price || a.itemId.localeCompare(b.itemId));

export function createMemoryCatalogRepo() {
  const catalogs = new Map();
  const items = new Map(); // `${catalogId}\u0000${itemId}` -> item
  const key = (c, i) => `${c}\u0000${i}`;
  return {
    catalogs, items,
    getCatalog: async (id) => (catalogs.has(id) ? structuredClone(catalogs.get(id)) : null),
    findByHash: async (hash) => {
      const c = [...catalogs.values()].find((x) => x.shareHash === hash || x.manageHash === hash);
      return c ? structuredClone(c) : null;
    },
    insertCatalog: async (doc) => { catalogs.set(doc._id, structuredClone(doc)); return structuredClone(doc); },
    upsertCatalog: async (doc) => { catalogs.set(doc._id, { ...(catalogs.get(doc._id) ?? {}), ...structuredClone(doc) }); return structuredClone(catalogs.get(doc._id)); },
    updateCatalog: async (id, set) => {
      if (!catalogs.has(id)) return null;
      catalogs.set(id, { ...catalogs.get(id), ...structuredClone(set) });
      return structuredClone(catalogs.get(id));
    },
    deleteCatalog: async (id) => { catalogs.delete(id); },
    listExpired: async (now) => [...catalogs.values()].filter((c) => c.source === 'merchant' && c.expiresAt && c.expiresAt <= now).map((c) => ({ _id: c._id })),

    listItems: async (catalogId) => sortItems([...items.values()].filter((i) => i.catalogId === catalogId).map((i) => structuredClone(i))),
    getItem: async (c, i) => (items.has(key(c, i)) ? structuredClone(items.get(key(c, i))) : null),
    countItems: async (catalogId) => [...items.values()].filter((i) => i.catalogId === catalogId).length,
    itemIds: async (catalogId) => new Set([...items.values()].filter((i) => i.catalogId === catalogId).map((i) => i.itemId)),
    upsertItems: async (catalogId, list) => { for (const it of list) items.set(key(catalogId, it.itemId), { ...structuredClone(it), catalogId }); },
    deleteItem: async (c, i) => { items.delete(key(c, i)); },
    deleteItems: async (catalogId, ids) => {
      for (const [k, v] of items) if (v.catalogId === catalogId && (!ids || ids.includes(v.itemId))) items.delete(k);
    },
  };
}
