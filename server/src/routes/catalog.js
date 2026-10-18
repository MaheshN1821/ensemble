import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { AppError, asyncHandler } from '../lib/errors.js';
import { LIMITS, publicCatalogConfig } from '../config/catalog.js';
import { requireSession } from '../middleware/session.js';
import { TEMPLATE_CSV, TEMPLATE_JSON } from '../services/catalog/templates.js';

const tokenFrom = (req) => String(req.get('x-catalog-token') ?? '').trim();

export function catalogRoutes({ config, catalogs, sessions }) {
  const router = Router();
  const auth = requireSession(sessions);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.maxFileBytes, files: 1, fieldSize: LIMITS.maxFileBytes } });
  // Each import downloads images, so it is limited per IP on top of the global limit. Step 9 revisits the numbers.
  const importLimit = rateLimit({
    windowMs: 60 * 60_000,
    limit: config.catalogImportsPerHour ?? 12,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'You have imported a lot of files this hour. Try again a little later.' } },
  });

  // Same multer, but its errors speak about a catalog file rather than a photo.
  const uploadFile = (req, res, next) =>
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('INVALID_FILE', `The file is larger than ${LIMITS.maxFileBytes / 1024} KB. Split it into smaller files.`, 413));
      if (err.code === 'LIMIT_UNEXPECTED_FILE') return next(new AppError('NO_FILE', 'Send one CSV or JSON file in the "file" field.', 400));
      return next(err);
    });

  const fileInput = (req) => {
    const content = req.file ? req.file.buffer.toString('utf8') : typeof req.body?.content === 'string' ? req.body.content : null;
    if (content === null) throw new AppError('NO_FILE', 'Choose a CSV or JSON file to import, or paste its contents.', 400);
    const name = req.file?.originalname?.toLowerCase() ?? '';
    const format = req.body?.format || (name.endsWith('.json') ? 'json' : name.endsWith('.csv') ? 'csv' : undefined);
    return { content, format };
  };

  router.get('/api/catalog/config', (_req, res) => res.json(publicCatalogConfig()));

  router.get('/api/catalog/sample', asyncHandler(async (_req, res) => res.json(await catalogs.getSample())));

  router.get('/api/catalog/template', (req, res) => {
    const json = req.query.format === 'json';
    res.setHeader('Content-Type', json ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ensemble-catalog-template.${json ? 'json' : 'csv'}"`);
    res.send(json ? TEMPLATE_JSON : TEMPLATE_CSV);
  });

  // Create a catalog from a file. Returns the two private links once; they cannot be recovered later.
  router.post(
    '/api/catalogs/import',
    importLimit,
    uploadFile,
    asyncHandler(async (req, res) => {
      const { content, format } = fileInput(req);
      const out = await catalogs.createFromImport({ name: req.body?.name, format, content });
      res.status(201).json(out);
    }),
  );

  router.get(
    '/api/catalogs/mine',
    asyncHandler(async (req, res) => res.json(await catalogs.open(tokenFrom(req)))),
  );

  router.post(
    '/api/catalogs/mine/import',
    importLimit,
    uploadFile,
    asyncHandler(async (req, res) => {
      const { content, format } = fileInput(req);
      res.json(await catalogs.importInto(tokenFrom(req), { content, format, mode: req.body?.mode || 'append' }));
    }),
  );

  router.delete(
    '/api/catalogs/mine/items/:itemId',
    asyncHandler(async (req, res) => res.json(await catalogs.removeItem(tokenFrom(req), req.params.itemId))),
  );

  router.delete(
    '/api/catalogs/mine',
    asyncHandler(async (req, res) => res.json(await catalogs.removeCatalog(tokenFrom(req)))),
  );

  // Which catalog this shopper session plans from. Default is the sample catalog.
  router.get(
    '/api/sessions/me/catalog',
    auth,
    asyncHandler(async (req, res) => {
      const info = await catalogs.describe(req.session.catalogId);
      res.json({ catalog: info ?? (await catalogs.describe(null)), fellBack: Boolean(req.session.catalogId && !info) });
    }),
  );

  router.put(
    '/api/sessions/me/catalog',
    auth,
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      if (body.sample === true) {
        await sessions.patch(req.session._id, { unset: ['catalogId'] });
        return res.json({ catalog: await catalogs.describe(null) });
      }
      const sel = await catalogs.selectionFor(typeof body.token === 'string' ? body.token.trim() : '');
      const next = await sessions.patch(req.session._id, { set: { catalogId: sel.id } });
      if (!next) throw new AppError('SESSION_EXPIRED', 'Your session has ended. Start again to continue.', 401);
      res.json({ catalog: await catalogs.describe(sel.id) });
    }),
  );

  return router;
}
