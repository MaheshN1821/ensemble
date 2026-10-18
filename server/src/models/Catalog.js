import mongoose from 'mongoose';

const colour = new mongoose.Schema({ hex: String, family: String, share: Number }, { _id: false });

// A catalog is either the built-in sample or a retailer's import. Retailers have no accounts: two random tokens
// act as links, and only their hashes are stored. `share` lets shoppers use the catalog; `manage` also edits it
// and shows the dashboard. Neither is recoverable, so the retailer is shown them once.
const catalogSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    source: { type: String, enum: ['sample', 'merchant'], required: true },
    version: { type: String, default: null }, // sample catalog only: which seed produced it
    shareHash: { type: String, default: null, index: { unique: true, sparse: true } },
    manageHash: { type: String, default: null, index: { unique: true, sparse: true } },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null, index: true }, // merchant catalogs only. Swept by the catalog service, not a TTL index, so stored images are deleted too.
  },
  { versionKey: false },
);

const itemSchema = new mongoose.Schema(
  {
    catalogId: { type: String, required: true },
    itemId: { type: String, required: true },
    type: { type: String, enum: ['outfit', 'necklace', 'earrings', 'lipstick'], required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    imageUrl: { type: String, required: true },
    sourceImageUrl: { type: String, default: null }, // where a merchant image came from
    imagePublicId: { type: String, default: null }, // storage id, for deletion
    imageWidth: Number,
    imageHeight: Number,
    garmentCategory: { type: String, default: null },
    colours: [colour],
    colourSource: { type: String, enum: ['merchant', 'image', 'none'], default: 'none' },
    metalTone: { type: String, default: null },
    formality: { type: Number, default: 3 },
    occasions: [String],
    productUrl: { type: String, default: null },
    style: { type: String, default: null },
    silhouette: { type: String, default: null },
    addedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
itemSchema.index({ catalogId: 1, itemId: 1 }, { unique: true });

export const Catalog = mongoose.models.Catalog || mongoose.model('Catalog', catalogSchema);
export const CatalogItem = mongoose.models.CatalogItem || mongoose.model('CatalogItem', itemSchema);
