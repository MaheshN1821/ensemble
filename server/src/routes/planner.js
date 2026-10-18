import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { requireSession } from '../middleware/session.js';
import { parsePlanBody } from '../services/planner/input.js';

export function plannerRoutes({ sessions, planner }) {
  const router = Router();
  const auth = requireSession(sessions);

  router.get('/api/planner/rules', (_req, res) => res.json(planner.rules()));

  // Plans three looks. Deterministic and free: no YouCam call, no language model. Safe to call as often as needed.
  router.post(
    '/api/sessions/me/plan',
    auth,
    asyncHandler(async (req, res) => {
      const constraints = parsePlanBody(req.body);
      res.json(await planner.planForSession(req.session, { constraints }));
    }),
  );

  return router;
}
