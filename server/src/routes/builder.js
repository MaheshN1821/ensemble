import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { requireSession } from '../middleware/session.js';

/**
 * Build your own look. Both routes are free: no YouCam call, no language model. The chosen look is drawn with the
 * existing POST /api/sessions/me/looks.
 */
export function builderRoutes({ sessions, builder }) {
  const router = Router();
  const auth = requireSession(sessions);

  // Everything this shopper can pick from, in the same scope their planned looks use.
  router.get('/api/sessions/me/builder/items', auth, asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(await builder.itemsForSession(req.session));
  }));

  // Scores a set of picked items against the shopper's colours and occasion, and checks the budget.
  router.post('/api/sessions/me/builder/preview', auth, asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    res.json(await builder.preview(req.session, { itemIds: body.itemIds, budgetInr: body.budgetInr }));
  }));

  return router;
}
