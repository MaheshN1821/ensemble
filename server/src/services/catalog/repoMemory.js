/** In-memory catalog repository, same methods as the Mongo one. Used by tests and as the createApp fallback. */
const TYPE_ORDER = { outfit: 0, necklace: 1, earrings: 2, lipstick: 3 };
export const sortItems = (list) => [...list].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.price - b.price || a.itemId.localeCompare(b.itemId));

export function createMemoryCatalogRepo() {
  const catalogs = new Map();
  const items = new Map(); // `${catalogId}\u0000${itemId}` -> item
  const uploads = new Map(); // id -> upload
  const key = (c, i) => `${c}\u0000${i}`;
  const inCatalog = (catalogId) => [...items.values()].filter((i) => i.catalogId === catalogId);
  const clone = (list) => list.map((i) => structuredClone(i));
  return {
    catalogs, items, uploads,
    getCatalog: async (id) => (catalogs.has(id) ? structuredClone(catalogs.get(id)) : null),
    upsertCatalog: async (doc) => { catalogs.set(doc._id, { ...(catalogs.get(doc._id) ?? {}), ...structuredClone(doc) }); return structuredClone(catalogs.get(doc._id)); },
    updateCatalog: async (id, set) => {
      if (!catalogs.has(id)) return null;
      catalogs.set(id, { ...catalogs.get(id), ...structuredClone(set) });
      return structuredClone(catalogs.get(id));
    },
    deleteCatalog: async (id) => { catalogs.delete(id); },
    listExpired: async (now) => [...catalogs.values()].filter((c) => c.source === 'merchant' && c.expiresAt && c.expiresAt <= now).map((c) => ({ _id: c._id })),

    listItems: async (catalogId) => sortItems(clone(inCatalog(catalogId))),
    listItemsByRetailer: async (catalogId, retailerId) => sortItems(clone(inCatalog(catalogId).filter((i) => i.retailerId === retailerId))),
    listItemsByUpload: async (catalogId, retailerId, uploadId) => sortItems(clone(inCatalog(catalogId).filter((i) => i.retailerId === retailerId && i.uploadId === uploadId))),
    getItem: async (c, i) => (items.has(key(c, i)) ? structuredClone(items.get(key(c, i))) : null),
    countItems: async (catalogId) => inCatalog(catalogId).length,
    countItemsByRetailer: async (catalogId, retailerId) => inCatalog(catalogId).filter((i) => i.retailerId === retailerId).length,
    itemIds: async (catalogId) => new Set(inCatalog(catalogId).map((i) => i.itemId)),
    itemIdsByRetailer: async (catalogId, retailerId) => new Set(inCatalog(catalogId).filter((i) => i.retailerId === retailerId).map((i) => i.itemId)),
    seedItemIds: async (catalogId) => new Set(inCatalog(catalogId).filter((i) => i.origin === 'seed').map((i) => i.itemId)),
    upsertItems: async (catalogId, list) => { for (const it of list) items.set(key(catalogId, it.itemId), { ...structuredClone(it), catalogId }); },
    deleteItem: async (c, i) => { items.delete(key(c, i)); },
    deleteItems: async (catalogId, ids) => {
      for (const [k, v] of items) if (v.catalogId === catalogId && (!ids || ids.includes(v.itemId))) items.delete(k);
    },

    insertUpload: async (doc) => { uploads.set(doc._id, structuredClone(doc)); return structuredClone(doc); },
    getUpload: async (id, retailerId) => {
      const u = uploads.get(id);
      return u && u.retailerId === retailerId ? structuredClone(u) : null;
    },
    listUploads: async (retailerId, limit = 100) => [...uploads.values()].filter((u) => u.retailerId === retailerId).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map((u) => structuredClone(u)),
    itemCountsByUpload: async (catalogId, retailerId) => {
      const out = {};
      for (const i of inCatalog(catalogId)) if (i.retailerId === retailerId && i.uploadId) out[i.uploadId] = (out[i.uploadId] ?? 0) + 1;
      return out;
    },
    deleteUpload: async (id) => { uploads.delete(id); },
    deleteUploadsByRetailer: async (retailerId) => { for (const [k, u] of uploads) if (u.retailerId === retailerId) uploads.delete(k); },
  };
}
