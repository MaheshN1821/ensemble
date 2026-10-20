// In-memory counter store with the same interface as store.js. Used by tests; imports nothing third-party.
/** Same interface in memory, for tests. */
export function createMemoryStatStore({ now = () => new Date() } = {}) {
  const docs = new Map();
  return {
    docs,
    async inc(catalogId, incs) {
      if (!catalogId || !incs || !Object.keys(incs).length) return;
      const doc = docs.get(catalogId) ?? { _id: catalogId, sessions: 0, looksGenerated: 0, looksDrawn: 0, units: 0, nothingWithinBudget: 0, itemPicks: {}, refinements: {}, since: now() };
      for (const [path, n] of Object.entries(incs)) {
        const [head, ...rest] = path.split('.');
        if (rest.length) { doc[head] ??= {}; doc[head][rest.join('.')] = (doc[head][rest.join('.')] ?? 0) + n; }
        else doc[head] = (doc[head] ?? 0) + n;
      }
      doc.updatedAt = now();
      docs.set(catalogId, doc);
    },
    async get(catalogId) {
      return docs.has(catalogId) ? structuredClone(docs.get(catalogId)) : null;
    },
    async delete(catalogId) {
      docs.delete(catalogId);
    },
  };
}

