import mongoose from 'mongoose';

/**
 * Unit ledger: one entry per gateway-level operation (file upload, task, cost lookup, delete).
 * Units are only charged by YouCam when a task succeeds, so failed entries carry 0 units.
 */
const ledgerSchema = new mongoose.Schema(
  {
    sessionId: { type: String, index: true, required: true },
    kind: { type: String, required: true }, // 'task' | 'feature-cost' | 'task-delete'
    feature: { type: String, default: null },
    taskId: { type: String, default: null },
    units: { type: Number, default: 0 },
    unitsKnown: { type: Boolean, default: true },
    success: { type: Boolean, required: true },
    durationMs: { type: Number, default: 0 },
    errorCode: { type: String, default: null },
    requestId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);
// Keep 30 days of aggregate history for the retailer view (Step 9).
ledgerSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const LedgerEntry = mongoose.models.LedgerEntry || mongoose.model('LedgerEntry', ledgerSchema);

const startOfUtcDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const sumUnits = async (match) => {
  const [row] = await LedgerEntry.aggregate([
    { $match: { ...match, success: true } },
    { $group: { _id: null, units: { $sum: '$units' } } },
  ]);
  return row?.units ?? 0;
};

export function createMongoLedger() {
  return {
    async record(entry) {
      const doc = await LedgerEntry.create(entry);
      return doc.toObject();
    },
    sessionUnits: (sessionId) => sumUnits({ sessionId }),
    dailyUnits: () => sumUnits({ createdAt: { $gte: startOfUtcDay() } }),
    async list(sessionId, limit = 50) {
      return LedgerEntry.find({ sessionId }).sort({ createdAt: -1 }).limit(limit).lean();
    },
  };
}

/** Same interface, in memory. Used by tests. */
export function createMemoryLedger() {
  const rows = [];
  return {
    rows,
    async record(entry) {
      const row = { _id: String(rows.length + 1), createdAt: new Date(), ...entry };
      rows.push(row);
      return row;
    },
    async sessionUnits(sessionId) {
      return rows.filter((r) => r.sessionId === sessionId && r.success).reduce((s, r) => s + r.units, 0);
    },
    async dailyUnits() {
      const from = startOfUtcDay();
      return rows.filter((r) => r.success && r.createdAt >= from).reduce((s, r) => s + r.units, 0);
    },
    async list(sessionId, limit = 50) {
      return rows.filter((r) => r.sessionId === sessionId).slice(-limit).reverse();
    },
  };
}
