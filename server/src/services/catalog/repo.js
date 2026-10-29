import { Catalog, CatalogItem } from '../../models/Catalog.js';
import { Upload } from '../../models/Upload.js';
import { sortItems } from './repoMemory.js';

/**
 * Storage for the catalog, its items and retailer uploads. Two implementations with the same methods: Mongo for the
 * app, memory for tests. Items are returned in a stable order (type, then price, then id) so the planner is deterministic.
 */
export function createMongoCatalogRepo() {
  const ids = async (query) => new Set((await CatalogItem.find(query).select('itemId').lean()).map((i) => i.itemId));
  return {
    getCatalog: (id) => Catalog.findById(id).lean(),
    upsertCatalog: (doc) => Catalog.findOneAndUpdate({ _id: doc._id }, { $set: doc }, { upsert: true, new: true }).lean(),
    updateCatalog: (id, set) => Catalog.findOneAndUpdate({ _id: id }, { $set: set }, { new: true }).lean(),
    deleteCatalog: (id) => Catalog.deleteOne({ _id: id }),
    listExpired: (now) => Catalog.find({ source: 'merchant', expiresAt: { $lte: now } }).select('_id').lean(),

    async listItems(catalogId) { return sortItems(await CatalogItem.find({ catalogId }).lean()); },
    async listItemsByRetailer(catalogId, retailerId) { return sortItems(await CatalogItem.find({ catalogId, retailerId }).lean()); },
    async listItemsByUpload(catalogId, retailerId, uploadId) { return sortItems(await CatalogItem.find({ catalogId, retailerId, uploadId }).lean()); },
    getItem: (catalogId, itemId) => CatalogItem.findOne({ catalogId, itemId }).lean(),
    countItems: (catalogId) => CatalogItem.countDocuments({ catalogId }),
    countItemsByRetailer: (catalogId, retailerId) => CatalogItem.countDocuments({ catalogId, retailerId }),
    itemIds: (catalogId) => ids({ catalogId }),
    itemIdsByRetailer: (catalogId, retailerId) => ids({ catalogId, retailerId }),
    seedItemIds: (catalogId) => ids({ catalogId, origin: 'seed' }),
    async upsertItems(catalogId, items) {
      if (!items.length) return;
      await CatalogItem.bulkWrite(items.map((it) => ({
        updateOne: { filter: { catalogId, itemId: it.itemId }, update: { $set: { ...it, catalogId } }, upsert: true },
      })));
    },
    deleteItem: (catalogId, itemId) => CatalogItem.deleteOne({ catalogId, itemId }),
    deleteItems: (catalogId, itemIds) => (itemIds ? CatalogItem.deleteMany({ catalogId, itemId: { $in: itemIds } }) : CatalogItem.deleteMany({ catalogId })),

    insertUpload: async (doc) => (await Upload.create(doc)).toObject(),
    getUpload: (id, retailerId) => Upload.findOne({ _id: id, retailerId }).lean(),
    listUploads: (retailerId, limit = 100) => Upload.find({ retailerId }).sort({ createdAt: -1 }).limit(limit).lean(),
    async itemCountsByUpload(catalogId, retailerId) {
      const rows = await CatalogItem.aggregate([
        { $match: { catalogId, retailerId, uploadId: { $ne: null } } },
        { $group: { _id: '$uploadId', n: { $sum: 1 } } },
      ]);
      return Object.fromEntries(rows.map((r) => [r._id, r.n]));
    },
    deleteUpload: (id) => Upload.deleteOne({ _id: id }),
    deleteUploadsByRetailer: (retailerId) => Upload.deleteMany({ retailerId }),
  };
}
