import { Router } from 'express';
import multer from 'multer';
import { AppError, asyncHandler } from '../lib/errors.js';
import { requireSession } from '../middleware/session.js';

const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png']);

/**
 * Development-only. Runs a REAL YouCam task end to end (upload, task, poll) so the Step 1 pipeline can be
 * verified. Spends units. Disabled unless ENABLE_DEV_ROUTES=true.
 */
export function devRoutes({ gateway, sessions }) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

  router.post(
    '/api/dev/probe/skin-tone',
    requireSession(sessions),
    upload.single('image'),
    asyncHandler(async (req, res) => {
      if (!req.file) throw new AppError('NO_FILE', 'Choose a photo to upload.', 400);
      if (!ALLOWED.has(req.file.mimetype)) throw new AppError('BAD_FILE_TYPE', 'Use a JPG or PNG photo.', 415);

      const result = await gateway.runTask({
        sessionId: req.session._id,
        requestId: req.id,
        feature: 'skin-tone-analysis',
        files: [{ field: 'src_file_id', buffer: req.file.buffer, fileName: req.file.originalname || 'selfie.jpg', contentType: req.file.mimetype === 'image/png' ? 'image/png' : 'image/jpg' }],
      });
      res.json({ taskId: result.taskId, units: result.units, unitsKnown: result.unitsKnown, durationMs: result.durationMs, results: result.results });
    }),
  );

  return router;
}
