import { Catalog, CatalogItem } from '../../models/Catalog.js';
import { sortItems } from './repoMemory.js';

/**
 * Storage for catalogs and items. Two implementations with the same methods: Mongo for the app, memory for tests.
 * Items are returned in a stable order (type, then price, then id) so the planner is deterministic.
 */
export function createMongoCatalogRepo() {
  return {
    getCatalog: (id) => Catalog.findById(id).lean(),
    findByHash: (hash) => Catalog.findOne({ $or: [{ shareHash: hash }, { manageHash: hash }] }).lean(),
    insertCatalog: async (doc) => (await Catalog.create(doc)).toObject(),
    upsertCatalog: (doc) => Catalog.findOneAndUpdate({ _id: doc._id }, { $set: doc }, { upsert: true, new: true }).lean(),
    updateCatalog: (id, set) => Catalog.findOneAndUpdate({ _id: id }, { $set: set }, { new: true }).lean(),
    deleteCatalog: (id) => Catalog.deleteOne({ _id: id }),
    listExpired: (now) => Catalog.find({ source: 'merchant', expiresAt: { $lte: now } }).select('_id').lean(),

    async listItems(catalogId) { return sortItems(await CatalogItem.find({ catalogId }).lean()); },
    getItem: (catalogId, itemId) => CatalogItem.findOne({ catalogId, itemId }).lean(),
    countItems: (catalogId) => CatalogItem.countDocuments({ catalogId }),
    async itemIds(catalogId) { return new Set((await CatalogItem.find({ catalogId }).select('itemId').lean()).map((i) => i.itemId)); },
    async upsertItems(catalogId, items) {
      if (!items.length) return;
      await CatalogItem.bulkWrite(items.map((it) => ({
        updateOne: { filter: { catalogId, itemId: it.itemId }, update: { $set: { ...it, catalogId } }, upsert: true },
      })));
    },
    deleteItem: (catalogId, itemId) => CatalogItem.deleteOne({ catalogId, itemId }),
    deleteItems: (catalogId, itemIds) => (itemIds ? CatalogItem.deleteMany({ catalogId, itemId: { $in: itemIds } }) : CatalogItem.deleteMany({ catalogId })),
  };
}
