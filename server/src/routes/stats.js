import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';

const tokenFrom = (req) => String(req.get('x-catalog-token') ?? '').trim();
const fileSlug = (name) => String(name ?? 'catalog').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'catalog';

/**
 * The retailer view (FR-29, FR-30): anonymous aggregate counts for one catalog, as JSON and as CSV.
 * A merchant catalog's numbers are behind its private manage link. The sample catalog's numbers are public, because the
 * sample catalog itself is public and its counts hold nothing personal; this is also how a reviewer sees the view working.
 */
export function statsRoutes({ catalogs, metrics }) {
  const router = Router();

  const forOwner = async (req) => {
    const { catalog, items } = await catalogs.openOwned(tokenFrom(req));
    return metrics.report(catalog, items);
  };
  const forSample = async () => {
    const { catalog, items } = await catalogs.getSample();
    return metrics.report(catalog, items);
  };
  const sendCsv = (res, report) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ensemble-usage-${fileSlug(report.catalog.name)}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(metrics.toCsv(report));
  };
  const sendJson = (res, report) => { res.setHeader('Cache-Control', 'no-store'); res.json(report); };

  router.get('/api/catalogs/mine/stats', asyncHandler(async (req, res) => sendJson(res, await forOwner(req))));
  router.get('/api/catalogs/mine/stats.csv', asyncHandler(async (req, res) => sendCsv(res, await forOwner(req))));
  router.get('/api/catalog/sample/stats', asyncHandler(async (_req, res) => sendJson(res, await forSample())));
  router.get('/api/catalog/sample/stats.csv', asyncHandler(async (_req, res) => sendCsv(res, await forSample())));

  return router;
}
