import { CatalogStat } from '../../models/CatalogStat.js';

/**
 * Counter stores. `inc(catalogId, { 'sessions': 1, 'itemPicks.<key>': 1 })` adds to counters atomically and creates the
 * document on first use. `get` returns the plain document or null. Both stores speak the same dotted-path language.
 */
export function createMongoStatStore() {
  return {
    async inc(catalogId, incs) {
      if (!catalogId || !incs || !Object.keys(incs).length) return;
      const now = new Date();
      await CatalogStat.updateOne(
        { _id: catalogId },
        { $inc: incs, $set: { updatedAt: now }, $setOnInsert: { since: now } },
        { upsert: true },
      );
    },
    async get(catalogId) {
      return CatalogStat.findById(catalogId).lean();
    },
    async delete(catalogId) {
      await CatalogStat.deleteOne({ _id: catalogId });
    },
  };
}
