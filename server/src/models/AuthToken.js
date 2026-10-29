import mongoose from 'mongoose';

// A signed-in browser. The token itself is random and never stored: only its SHA-256 is, so a database leak cannot be
// replayed. Unlike photos, these hold nothing in outside storage, so a plain Mongo TTL index is right for expiry.
const authTokenSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // sha256(token)
    accountId: { type: String, required: true, index: true },
    role: { type: String, enum: ['retailer', 'shopper'], required: true },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthToken = mongoose.models.AuthToken || mongoose.model('AuthToken', authTokenSchema);
