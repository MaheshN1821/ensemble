import mongoose from 'mongoose';

const colour = new mongoose.Schema({ hex: String, family: String, share: Number }, { _id: false });

// There is one shared catalog ('main'). Every shopper plans from it and every retailer's items are stored in it, so
// nothing depends on a private link. (Older private catalogs from before accounts may still exist until they expire;
// the catalog service sweeps them.)
const catalogSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    source: { type: String, enum: ['main', 'merchant'], required: true },
    version: { type: String, default: null }, // main catalog: fingerprint of the seed file last applied
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null, index: true }, // legacy private catalogs only
  },
  { versionKey: false },
);

const itemSchema = new mongoose.Schema(
  {
    catalogId: { type: String, required: true },
    itemId: { type: String, required: true }, // unique in the catalog. A retailer's own id is prefixed with their code.
    sku: { type: String, default: null }, // the id exactly as the retailer wrote it (without the prefix)
    origin: { type: String, enum: ['seed', 'retailer'], default: 'retailer' },
    retailerId: { type: String, default: null, index: true }, // the owning account. null for the built-in items
    retailerName: { type: String, default: null }, // shown to shoppers as "Sold by"
    uploadId: { type: String, default: null, index: true }, // the latest upload that wrote this item
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
