import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../lib/errors.js';
import { requireSession } from '../middleware/session.js';

export function sessionRoutes({ config, sessions, ledger }) {
  const router = Router();

  const createLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many sessions from this network. Try again later.' } },
  });

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
