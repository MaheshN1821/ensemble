import mongoose from 'mongoose';

// One collection for both kinds of account. A person can hold a shopper account and a retailer account with the same
// email: they are separate sign-ins (unique on email + role), so a retailer login never exposes a shopper's photos.
const retailerSchema = new mongoose.Schema(
  {
    code: { type: String, required: true }, // short, unique, prefixes this retailer's item ids in the shared catalog
    businessName: { type: String, required: true },
    phone: { type: String, required: true },
    city: { type: String, required: true },
    website: { type: String, default: null },
    gstin: { type: String, default: null },
  },
  { _id: false },
);

const accountSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    role: { type: String, enum: ['retailer', 'shopper'], required: true },
    email: { type: String, required: true }, // lower-cased
    name: { type: String, default: '' },
    passwordHash: { type: String, required: true }, // scrypt, see services/auth/passwords.js
    retailer: { type: retailerSchema, default: null },
    termsAcceptedAt: { type: Date, default: null }, // retailers: image rights. Shoppers: keeping their data in the account.
    createdAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
  },
  { versionKey: false },
);
accountSchema.index({ email: 1, role: 1 }, { unique: true });
accountSchema.index({ 'retailer.code': 1 }, { unique: true, sparse: true });

export const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);
