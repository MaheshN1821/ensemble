// Fakes with no third-party imports, so logic tests can run without the full dependency tree.

export function createMemoryStorage({ configured = true } = {}) {
  const assets = new Map();
  const buffers = new Map();
  let n = 0;
  return {
    provider: 'memory',
    assets,
    isConfigured: () => configured,
    saveBuffer: async ({ sessionId, buffer, kind }) => {
      const publicId = `ensemble/${sessionId}/${kind}-${++n}`;
      assets.set(publicId, sessionId);
      buffers.set(publicId, buffer);
      return { publicId, bytes: buffer.length };
    },
    readBuffer: async (publicId) => buffers.get(publicId),
    signedUrl: (publicId) => `https://cdn.test/${publicId}?sig=1`,
    deleteAsset: async (publicId) => { assets.delete(publicId); },
    deleteAssets: async (ids) => { ids.forEach((id) => assets.delete(id)); return { deleted: ids.length }; },
    saveCatalogImage: async ({ catalogId, itemId, buffer }) => {
      const publicId = `ensemble-catalog/${catalogId}/${itemId}`;
      assets.set(publicId, `catalog:${catalogId}`);
      return { url: `https://cdn.test/${publicId}`, publicId, colours: [] };
    },
    deleteCatalogImage: async (publicId) => { assets.delete(publicId); },
    deleteCatalog: async (catalogId) => {
      let deleted = 0;
      for (const [id, s] of assets) if (s === `catalog:${catalogId}`) { assets.delete(id); deleted++; }
      return { deleted };
    },
    deleteSession: async (sessionId) => {
      let deleted = 0;
      for (const [id, s] of assets) if (s === sessionId) { assets.delete(id); deleted++; }
      return { deleted };
    },
  };
}

/** In-memory stand-ins so intake routes can be tested without Mongo or Cloudinary. */
export function createMemorySessions(ids = ['sess-1']) {
  const docs = new Map(ids.map((id) => [id, { _id: id, expiresAt: new Date(Date.now() + 3_600_000), photos: {} }]));
  const setPath = (obj, path, value) => {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach((k) => { o[k] ??= {}; o = o[k]; });
    o[keys.at(-1)] = value;
  };
  const unsetPath = (obj, path) => {
    const keys = path.split('.');
    let o = obj;
    for (const k of keys.slice(0, -1)) { o = o?.[k]; if (!o) return; }
    delete o[keys.at(-1)];
  };
  return {
    docs,
    create: async () => ({ id: 'sess-1', expiresAt: new Date(Date.now() + 1000) }),
    get: async (id) => (docs.has(id) ? structuredClone(docs.get(id)) : null),
    patch: async (id, { set = {}, unset = [] } = {}) => {
      const d = docs.get(id);
      if (!d) return null;
      Object.entries(set).forEach(([k, v]) => setPath(d, k, v));
      unset.forEach((k) => unsetPath(d, k));
      return structuredClone(d);
    },
    remove: async (id) => { docs.delete(id); },
    markOnce: async (id, flag) => {
      const d = docs.get(id);
      if (!d || new Date(d.expiresAt) <= new Date()) return false;
      d.counted ??= [];
      if (d.counted.includes(flag)) return false;
      d.counted.push(flag);
      return true;
    },
    // accounts (same behaviour as the Mongo session service)
    findByAccount: async (accountId) => {
      const d = [...docs.values()].find((x) => x.accountId === accountId && new Date(x.expiresAt) > new Date());
      return d ? structuredClone(d) : null;
    },
    createForAccount: async (accountId) => {
      const id = `acct-sess-${docs.size + 1}`;
      const expiresAt = new Date(Date.now() + 365 * 86_400_000);
      docs.set(id, { _id: id, expiresAt, photos: {}, accountId });
      return { id, expiresAt };
    },
    adoptForAccount: async (id, accountId) => {
      const d = docs.get(id);
      if (!d || new Date(d.expiresAt) <= new Date() || d.accountId) return null;
      d.accountId = accountId;
      d.expiresAt = new Date(Date.now() + 365 * 86_400_000);
      return structuredClone(d);
    },
    extendForAccount: async (id) => {
      const d = docs.get(id);
      if (!d) return null;
      d.expiresAt = new Date(Date.now() + 365 * 86_400_000);
      return structuredClone(d);
    },
    dropExcludedItems: async (ids) => { for (const d of docs.values()) if (d.agent?.excludeItemIds) d.agent.excludeItemIds = d.agent.excludeItemIds.filter((x) => !ids.includes(x)); },
    listExpired: async (limit = 25) => [...docs.values()].filter((d) => new Date(d.expiresAt) <= new Date()).slice(0, limit).map((d) => structuredClone(d)),
  };
}

