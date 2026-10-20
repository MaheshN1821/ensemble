import { randomBytes } from 'node:crypto';
import { Session } from '../models/Session.js';

export function createSessionService({ ttlHours }) {
  const live = (id) => ({ _id: id, expiresAt: { $gt: new Date() } });
  return {
    async create() {
      const id = randomBytes(18).toString('base64url');
      const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
      await Session.create({ _id: id, expiresAt });
      return { id, expiresAt };
    },
    async get(id) {
      if (!id || typeof id !== 'string' || id.length > 64) return null;
      return Session.findOne(live(id)).lean();
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
