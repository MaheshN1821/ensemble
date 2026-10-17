import { Router } from 'express';
import { AppError, asyncHandler } from '../lib/errors.js';
import { requireSession } from '../middleware/session.js';
import { profileOptions } from '../services/skin/profile.js';

export function skinRoutes({ sessions, skin }) {
  const router = Router();
  const auth = requireSession(sessions);
  const reply = (res, stored, session, opts) => res.json({ profile: skin.present(stored, session, opts), options: profileOptions() });

  // Never spends units.
  router.get('/api/sessions/me/skin-profile', auth, (req, res) => {
    reply(res, skin.current(req.session), req.session);
  });

  // Reads the skin tone from the selfie. Returns the cached reading when the selfie has not changed, so repeating
  // this call (a double click, a refresh) is free. Sample models are read locally and send nothing to YouCam.
  router.post(
    '/api/sessions/me/skin-profile',
    auth,
    asyncHandler(async (req, res) => {
      const { stored, cached } = await skin.analyse(req.session, { requestId: req.id });
      reply(res, stored, req.session, { cached });
    }),
  );

  router.put(
    '/api/sessions/me/skin-profile/override',
    auth,
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      if (!('undertone' in body) && !('depth' in body)) {
        throw new AppError('INVALID_INPUT', 'Choose an undertone or a depth to adjust.', 400);
      }
      for (const k of ['undertone', 'depth']) {
        if (k in body && body[k] !== null && typeof body[k] !== 'string') throw new AppError('INVALID_INPUT', 'Choose one of the listed options.', 400, { field: k });
      }
      const stored = await skin.setOverride(req.session, { undertone: body.undertone, depth: body.depth });
      reply(res, stored, req.session);
    }),
  );

  router.delete(
    '/api/sessions/me/skin-profile/override',
    auth,
    asyncHandler(async (req, res) => {
      const stored = await skin.clearOverride(req.session);
      reply(res, stored, req.session);
    }),
  );

  return router;
}
