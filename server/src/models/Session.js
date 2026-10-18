import mongoose from 'mongoose';

const asset = new mongoose.Schema(
  {
    source: { type: String, enum: ['upload', 'sample'], required: true },
    publicId: { type: String, default: null }, // Cloudinary id for uploads, null for samples
    sampleId: { type: String, default: null },
    width: Number,
    height: Number,
    bytes: Number,
    hash: { type: String, default: null }, // SHA-256 of the uploaded bytes: the render cache key (FR-19)
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// One drawn image (Stage 6). The image itself lives in storage; the database keeps only its reference.
const renderEntry = new mongoose.Schema(
  {
    key: { type: String, required: true },
    stage: String,
    root: { type: String, enum: ['selfie', 'body'] }, // which photo it was drawn from, so replacing the photo drops it
    publicId: String,
    width: Number,
    height: Number,
    feature: String,
    taskId: String,
    units: Number,
    at: Date,
  },
  { _id: false },
);

const lookStage = new mongoose.Schema(
  {
    status: { type: String, enum: ['idle', 'done', 'failed'], default: 'idle' },
    key: String,
    cached: Boolean,
    units: Number,
    unitsKnown: Boolean,
    durationMs: Number,
    error: { type: new mongoose.Schema({ code: String, message: String, retryable: Boolean }, { _id: false }), default: null },
    at: Date,
  },
  { _id: false },
);

// A look the shopper chose to see on themselves: which items, and where each stage's result is. Metadata only.
const look = new mongoose.Schema(
  {
    id: { type: String, required: true },
    createdAt: Date,
    updatedAt: Date,
    snapshot: mongoose.Schema.Types.Mixed, // items (names, prices, product links), score and reasons as planned
    stages: {
      outfit: { type: lookStage, default: () => ({}) },
      earrings: { type: lookStage, default: () => ({}) },
      necklace: { type: lookStage, default: () => ({}) },
      lipstick: { type: lookStage, default: () => ({}) },
    },
    faceChain: [new mongoose.Schema({ slot: String, key: String }, { _id: false })], // face results in the order they were applied
  },
  { _id: false, minimize: false },
);

// Skin tone reading for the current selfie. Colour numbers and labels only, never the image or face data.
const skinProfile = new mongoose.Schema(
  {
    selfieKey: String, // which selfie it was read from; a different selfie invalidates it
    source: { type: String, enum: ['youcam', 'sample'] },
    analysedAt: Date,
    skin: { hex: String, L: Number, a: Number, b: Number, ita: Number, hue: Number, chroma: Number },
    depth: { id: String, source: String },
    undertone: { id: String, source: String, confidence: String },
    signals: [String],
    units: Number,
    unitsKnown: Boolean,
    taskId: String,
    override: {
      type: new mongoose.Schema({ undertone: { type: String, default: null }, depth: { type: String, default: null } }, { _id: false }),
      default: null,
    },
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
    skinProfile: { type: skinProfile, default: null },
    looks: { type: [look], default: [] },
    renderCache: { type: [renderEntry], default: [] },
    renderRuns: { type: Number, default: 0 }, // stage runs sent to YouCam this session (per-session render cap)
    catalogId: { type: String, default: null }, // which catalog the planner uses; null means the sample catalog
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
