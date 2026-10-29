import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../lib/errors.js';
import { requireAccount } from '../middleware/auth.js';
import { fileInput, uploadFile } from '../middleware/catalogFile.js';

const fileSlug = (name) => String(name ?? 'catalog').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'catalog';

/**
 * Everything a signed-in retailer does: see all of their items and uploads, add a file, delete an item or a whole upload,
 * and read how often shoppers' looks used their items. Every route here is scoped to the signed-in retailer's own items.
 */
export function retailerRoutes({ config, auth, catalogs, metrics, limiters }) {
  const router = Router();
  const retailer = requireAccount(auth, 'retailer');
  // Each import downloads images, so it is limited per IP on top of the global limit.
  const importLimit = rateLimit({
    windowMs: 60 * 60_000,
    limit: config.catalogImportsPerHour ?? 12,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'You have imported a lot of files this hour. Try again a little later.' } },
  });

  router.get('/api/retailer/dashboard', retailer, asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ account: auth.present(req.account), ...(await catalogs.openDashboard(req.account)) });
  }));

  router.post('/api/retailer/uploads', retailer, importLimit, uploadFile, asyncHandler(async (req, res) => {
    const { content, format, fileName } = fileInput(req);
    const out = await catalogs.importForRetailer(req.account, { content, format, fileName, mode: req.body?.mode || 'append' });
    res.status(201).json({ account: auth.present(req.account), ...out });
  }));

  router.get('/api/retailer/uploads/:uploadId/report', retailer, asyncHandler(async (req, res) => res.json(await catalogs.uploadReport(req.account, req.params.uploadId))));

  router.delete('/api/retailer/uploads/:uploadId', retailer, asyncHandler(async (req, res) => {
    res.json({ account: auth.present(req.account), ...(await catalogs.removeUpload(req.account, req.params.uploadId)) });
  }));

  router.delete('/api/retailer/items/:itemId', retailer, asyncHandler(async (req, res) => {
    res.json({ account: auth.present(req.account), ...(await catalogs.removeItem(req.account, req.params.itemId)) });
  }));

  // How often shoppers' looks used this retailer's items. Anonymous counts only.
  const statsFor = async (req) => {
    const items = await catalogs.itemsOf(req.account);
    return { report: await metrics.retailerReport(items), items };
  };
  router.get('/api/retailer/stats', retailer, limiters.stats, asyncHandler(async (req, res) => {
    const { report } = await statsFor(req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ...report, retailer: { businessName: req.account.retailer.businessName } });
  }));
  router.get('/api/retailer/stats.csv', retailer, limiters.stats, asyncHandler(async (req, res) => {
    const { report, items } = await statsFor(req);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ensemble-usage-${fileSlug(req.account.retailer.businessName)}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(metrics.retailerCsv(report, items));
  }));

  return router;
}
