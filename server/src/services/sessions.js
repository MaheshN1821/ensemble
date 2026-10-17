import { randomBytes } from 'node:crypto';
import { Session } from '../models/Session.js';

export function createSessionService({ ttlHours }) {
  return {
    async create() {
      const id = randomBytes(18).toString('base64url');
      const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);
      await Session.create({ _id: id, expiresAt });
      return { id, expiresAt };
    },
    async get(id) {
      if (!id || typeof id !== 'string' || id.length > 64) return null;
      return Session.findOne({ _id: id, expiresAt: { $gt: new Date() } }).lean();
    },
  };
}
