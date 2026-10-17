import mongoose from 'mongoose';

// Metadata only. Photos and face data are never stored in the database (FR-31).
const sessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);
// MongoDB removes the document once expiresAt passes.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
