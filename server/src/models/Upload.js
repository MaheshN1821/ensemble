import mongoose from 'mongoose';

// One file a retailer imported. Kept so the dashboard can show everything they ever uploaded, what happened to each
// row, and delete a whole upload at once. The items themselves live in the shared catalog and point back here.
const problem = new mongoose.Schema(
  {
    line: Number,
    id: String,
    name: String,
    status: String,
    updated: Boolean,
    errors: [new mongoose.Schema({ field: String, message: String }, { _id: false })],
    warnings: [new mongoose.Schema({ field: String, message: String }, { _id: false })],
  },
  { _id: false },
);

const uploadSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    retailerId: { type: String, required: true, index: true },
    fileName: { type: String, default: '' },
    format: { type: String, default: null },
    mode: { type: String, enum: ['append', 'replace'], default: 'append' },
    status: { type: String, enum: ['imported', 'rejected'], required: true },
    createdAt: { type: Date, default: Date.now, index: true },
    totals: {
      rows: Number,
      imported: Number,
      updated: Number,
      rejected: Number,
      withWarnings: Number,
      removed: Number,
    },
    problems: { type: [problem], default: [] }, // only rows that were rejected or warned, capped
  },
  { versionKey: false },
);

export const Upload = mongoose.models.Upload || mongoose.model('Upload', uploadSchema);
