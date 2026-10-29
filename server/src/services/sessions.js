import { randomBytes } from 'node:crypto';
import { Session } from '../models/Session.js';

const DAY = 86_400_000;

export function createSessionService({ ttlHours, accountDays = 365 }) {
  const live = (id) => ({ _id: id, expiresAt: { $gt: new Date() } });
  const accountExpiry = () => new Date(Date.now() + accountDays * DAY);
  return {
    async create() {
      const id = randomBytes(18).toString('base64url');
      const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
      await Session.create({ _id: id, expiresAt });
      return { id, expiresAt };
    },
    async get(id) {
      if (!id || typeof id !== 'string' || id.length > 64) return null;
      const doc = await Session.findOne(live(id)).lean();
      // A signed-in shopper's session lasts months, but the spending counters are per day: reset them once a day.
      if (doc?.accountId && (!doc.capsResetAt || Date.now() - new Date(doc.capsResetAt).getTime() > DAY)) {
        const fresh = await Session.findOneAndUpdate(
          live(id),
          { $set: { capsResetAt: new Date(), renderRuns: 0, 'agent.turns': 0, 'agent.llmCalls': 0 } },
          { new: true },
        ).lean();
        return fresh ?? doc;
      }
      return doc;
    },

    // ---- Accounts ----
    async findByAccount(accountId) {
      return Session.findOne({ accountId, expiresAt: { $gt: new Date() } }).lean();
    },
    async createForAccount(accountId) {
      const id = randomBytes(18).toString('base64url');
      const expiresAt = accountExpiry();
      await Session.create({ _id: id, expiresAt, accountId, capsResetAt: new Date() });
      return { id, expiresAt };
    },
    /** Makes an anonymous session the account's own, keeping everything in it. Null if it expired or belongs to someone else. */
    async adoptForAccount(id, accountId) {
      if (!id || typeof id !== 'string' || id.length > 64) return null;
      return Session.findOneAndUpdate(
        { ...live(id), accountId: null },
        { $set: { accountId, expiresAt: accountExpiry(), capsResetAt: new Date() } },
        { new: true },
      ).lean();
    },
    /** Each visit pushes the expiry out again, so a session only lapses after a long time away. */
    async extendForAccount(id) {
      return Session.findOneAndUpdate(live(id), { $set: { expiresAt: accountExpiry() } }, { new: true }).lean();
    },
    /** A retailer deleted items: shoppers who had asked never to see them no longer need that entry. */
    async dropExcludedItems(itemIds) {
      if (!itemIds?.length) return;
      await Session.updateMany({ 'agent.excludeItemIds': { $in: itemIds } }, { $pull: { 'agent.excludeItemIds': { $in: itemIds } } });
    },
    /**
     * Sets and unsets dotted fields on a live session, e.g. { set: { 'photos.selfie': {...} }, unset: ['preferences'] }.
     * Returns the new document, or null if the session has expired.
     */
    async patch(id, { set = {}, unset = [] } = {}) {
      const update = {};
      if (Object.keys(set).length) update.$set = set;
      if (unset.length) update.$unset = Object.fromEntries(unset.map((k) => [k, '']));
      return Session.findOneAndUpdate(live(id), update, { new: true }).lean();
    },
    async remove(id) {
      await Session.deleteOne({ _id: id });
    },
    /**
     * Sets a once-only flag on a live session. True the first time, false after that (atomic, so two requests at once
     * cannot both win). Used so the retailer counters count a session once.
     */
    async markOnce(id, flag) {
      const res = await Session.updateOne({ ...live(id), counted: { $ne: flag } }, { $addToSet: { counted: flag } });
      return res.modifiedCount === 1;
    },
    /** Sessions past their expiry that still hold data. The sweeper deletes their stored images, then removes them. */
    async listExpired(limit = 25) {
      return Session.find({ expiresAt: { $lte: new Date() } }).sort({ expiresAt: 1 }).limit(limit).lean();
    },
  };
}
