import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { resolveLimits } from '../config/limits.js';

export function systemRoutes({ config, gateway, queue, storage, dbState, purger }) {
  const router = Router();

  router.get('/healthz', (_req, res) => {
    const db = dbState();
    res.status(db === 'connected' ? 200 : 503).json({ ok: db === 'connected', db, uptimeSec: Math.round(process.uptime()) });
  });

  // Read-only snapshot for the System page. Contains no secrets.
  router.get('/api/system/status', (_req, res) => {
    res.json({
      api: 'ok',
      database: { state: dbState() },
      youcam: { keyConfigured: Boolean(config.youcam.apiKey), baseUrl: config.youcam.baseUrl },
      storage: { provider: storage.provider, configured: storage.isConfigured() },
      queue: queue.stats(),
      caps: { sessionUnits: config.sessionUnitCap, globalDailyUnits: config.globalDailyUnitCap, sessionRenders: config.render?.sessionRenderCap ?? null },
      limits: resolveLimits(config.limits),
      // Expired sessions are deleted (photos, drawn images, YouCam tasks) by a sweeper. These are its own counts, no personal data.
      privacy: { sweeper: purger?.status?.() ?? null, sessionTtlHours: config.sessionTtlHours ?? null },
      devRoutes: config.enableDevRoutes,
    });
  });

  // Live unit prices. Shown in the interface and used for budget checks.
  router.get(
    '/api/youcam/feature-cost',
    asyncHandler(async (req, res) => {
      const result = await gateway.featureCost({ sessionId: req.get('x-session-id') || 'system' });
      res.json(result);
    }),
  );

  return router;
}
