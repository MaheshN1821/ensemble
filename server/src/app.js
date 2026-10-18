import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { systemRoutes } from './routes/system.js';
import { sessionRoutes } from './routes/sessions.js';
import { intakeRoutes } from './routes/intake.js';
import { skinRoutes } from './routes/skin.js';
import { catalogRoutes } from './routes/catalog.js';
import { createSkinService } from './services/skin/service.js';
import { createCatalogService } from './services/catalog/service.js';
import { createMemoryCatalogRepo } from './services/catalog/repoMemory.js';
import { createImporter } from './services/catalog/importer.js';
import { createSafeFetcher } from './lib/safeFetch.js';
import { LIMITS } from './config/catalog.js';
import { devRoutes } from './routes/dev.js';

// Tests pass their own catalog service; production passes one built over Mongo in index.js. This default keeps
// createApp usable with the older dependency set (in-memory repository, real image fetcher).
function createDefaultCatalogService({ config, logger, storage }) {
  const fetcher = createSafeFetcher({ maxBytes: LIMITS.maxImageBytes, timeoutMs: LIMITS.imageTimeoutMs, maxRedirects: LIMITS.maxRedirects });
  return createCatalogService({ repo: createMemoryCatalogRepo(), importer: createImporter({ fetcher, storage, logger }), storage, config, logger });
}

export function createApp(deps) {
  const { config, logger } = deps;
  const app = express();

  app.set('trust proxy', 1); // Render terminates TLS in front of us
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => req.id, autoLogging: { ignore: (req) => req.url === '/healthz' } }));
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Same-origin tools (curl, health checks) send no Origin header.
        if (!origin || config.clientOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      allowedHeaders: ['Content-Type', 'X-Session-Id', 'X-Request-Id', 'X-Catalog-Token'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Slow down for a moment.' } },
    }),
  );

  app.use(systemRoutes(deps));
  app.use(sessionRoutes(deps));
  app.use(intakeRoutes(deps));
  const skin = deps.skin ?? createSkinService(deps);
  app.use(skinRoutes({ ...deps, skin }));
  const catalogs = deps.catalogs ?? createDefaultCatalogService(deps);
  app.use(catalogRoutes({ ...deps, catalogs }));
  if (config.enableDevRoutes) app.use(devRoutes(deps));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
