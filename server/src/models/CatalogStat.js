import mongoose from 'mongoose';

// Aggregate usage counters for one catalog (FR-29). Numbers only: no session ids, no photos, no personal data.
// `itemPicks` and `refinements` are maps of encoded key -> count, incremented atomically with $inc.
const statSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // catalog id, or 'sample'
    sessions: { type: Number, default: 0 },
    looksGenerated: { type: Number, default: 0 },
    looksDrawn: { type: Number, default: 0 },
    units: { type: Number, default: 0 },
    nothingWithinBudget: { type: Number, default: 0 },
    itemPicks: { type: mongoose.Schema.Types.Mixed, default: {} },
    refinements: { type: mongoose.Schema.Types.Mixed, default: {} },
    since: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false, minimize: false },
);

export const CatalogStat = mongoose.models.CatalogStat || mongoose.model('CatalogStat', statSchema);
