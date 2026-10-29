import { Router } from 'express';
import { asyncHandler, AppError } from '../lib/errors.js';
import { requireSession } from '../middleware/session.js';
import { publicCatalogConfig } from '../config/catalog.js';
import { TEMPLATE_CSV, TEMPLATE_JSON } from '../services/catalog/templates.js';

/** The shared catalog: open to everyone, no account and no link needed. */
export function catalogRoutes({ catalogs, sessions }) {
  const router = Router();

  router.get('/api/catalog/config', (_req, res) => res.json(publicCatalogConfig()));

  router.get('/api/catalog', asyncHandler(async (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache'); // always the current items: a retailer's upload or delete shows on the next load
    res.json(await catalogs.getMain());
  }));

  // A retailer's store link: opens a page with only their items. Public, no account.
  router.get('/api/catalog/store/:code', asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(await catalogs.getStore(String(req.params.code).toLowerCase()));
  }));

  // Limits this session's suggestions to one retailer's items, or (code: null) back to every retailer.
  router.put('/api/sessions/me/store', requireSession(sessions), asyncHandler(async (req, res) => {
    const raw = req.body?.code;
    if (raw === null || raw === undefined || raw === '') {
      await sessions.patch(req.session._id, { unset: ['storeCode'] });
      return res.json({ store: null });
    }
    const code = String(raw).toLowerCase();
    const { store } = await catalogs.getStore(code); // 404 when it does not exist
    if (!(await sessions.patch(req.session._id, { set: { storeCode: code } }))) throw new AppError('SESSION_EXPIRED', 'Your session has ended. Start again.', 401);
    res.json({ store });
  }));

  router.get('/api/catalog/template', (req, res) => {
    const json = req.query.format === 'json';
    res.setHeader('Content-Type', json ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ensemble-catalog-template.${json ? 'json' : 'csv'}"`);
    res.send(json ? TEMPLATE_JSON : TEMPLATE_CSV);
  });

  return router;
}
