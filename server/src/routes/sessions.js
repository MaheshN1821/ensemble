import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { requireSession } from '../middleware/session.js';
import { ipLimiter } from '../lib/ipLimits.js';
import { resolveLimits } from '../config/limits.js';

export function sessionRoutes({ config, sessions, ledger }) {
  const router = Router();

  const createLimiter = ipLimiter({ name: 'sessions', windowMs: 3_600_000, limit: resolveLimits(config.limits).sessionsPerHour, message: 'Too many sessions from this network. Try again later.' });

  router.post(
    '/api/sessions',
    createLimiter,
    asyncHandler(async (_req, res) => {
      const { id, expiresAt } = await sessions.create();
      res.status(201).json({ sessionId: id, expiresAt, caps: { units: config.sessionUnitCap } });
    }),
  );

  router.get(
    '/api/sessions/me/ledger',
    requireSession(sessions),
    asyncHandler(async (req, res) => {
      const [entries, unitsUsed] = await Promise.all([ledger.list(req.session._id, 50), ledger.sessionUnits(req.session._id)]);
      res.json({ entries, unitsUsed, cap: config.sessionUnitCap });
    }),
  );

  return router;
}
