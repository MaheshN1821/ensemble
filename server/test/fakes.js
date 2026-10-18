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
