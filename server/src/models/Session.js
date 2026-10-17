import mongoose from 'mongoose';

const asset = new mongoose.Schema(
  {
    source: { type: String, enum: ['upload', 'sample'], required: true },
    publicId: { type: String, default: null }, // Cloudinary id for uploads, null for samples
    sampleId: { type: String, default: null },
    width: Number,
    height: Number,
    bytes: Number,
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Metadata only. Photos and face data are never stored in the database (FR-31): we keep a storage reference,
// never the image itself.
const sessionSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    consent: {
      type: new mongoose.Schema(
        { acceptedAt: Date, version: String, over18: Boolean, ownPhotos: Boolean },
        { _id: false },
      ),
      default: null,
    },
    photos: {
      selfie: { type: asset, default: null },
      body: { type: asset, default: null },
    },
    preferences: {
      type: new mongoose.Schema(
        {
          occasion: String,
          occasionText: String,
          budgetInr: Number,
          silhouettes: [String],
          metal: String,
          avoidColours: [String],
          notes: String,
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { versionKey: false, minimize: false },
);
// MongoDB removes the document once expiresAt passes.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);
