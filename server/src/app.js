import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { requestId } from './middleware/requestId.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { systemRoutes } from './routes/system.js';
import { sessionRoutes } from './routes/sessions.js';
import { intakeRoutes } from './routes/intake.js';
import { skinRoutes } from './routes/skin.js';
import { catalogRoutes } from './routes/catalog.js';
import { authRoutes } from './routes/auth.js';
import { retailerRoutes } from './routes/retailer.js';
import { accountRoutes } from './routes/account.js';
import { createAuthService } from './services/auth/service.js';
import { createMemoryAuthStore } from './services/auth/storeMemory.js';
import { plannerRoutes } from './routes/planner.js';
import { renderRoutes } from './routes/render.js';
import { agentRoutes } from './routes/agent.js';
import { createAgentService } from './services/agent/service.js';
import { createLlm } from './services/agent/llm.js';
import { createRenderService } from './services/render/service.js';
import { createPlannerService } from './services/planner/service.js';
import { createSkinService } from './services/skin/service.js';
import { createCatalogService } from './services/catalog/service.js';
import { createMemoryCatalogRepo } from './services/catalog/repoMemory.js';
import { createImporter } from './services/catalog/importer.js';
import { createSafeFetcher } from './lib/safeFetch.js';
import { LIMITS } from './config/catalog.js';
import { LIMITS as RENDER_LIMITS } from './config/render.js';
import { devRoutes } from './routes/dev.js';
import { createMetrics } from './services/metrics/service.js';
import { createMemoryStatStore } from './services/metrics/storeMemory.js';
import { createPurger } from './services/privacy/purge.js';
import { createLimiters } from './lib/ipLimits.js';
import { maskUrl, shortId } from './lib/logIds.js';

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
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url === '/healthz' },
      // Tokens in the path (share links) are masked, the session is logged as a one-way fingerprint, and failures stand out.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: maskUrl(req.url) }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customProps: (req) => (req.session?._id ? { sid: shortId(req.session._id) } : {}),
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Same-origin tools (curl, health checks) send no Origin header.
        if (!origin || config.clientOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      allowedHeaders: ['Content-Type', 'X-Session-Id', 'X-Request-Id', 'Authorization'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  const limiters = createLimiters({ config, logger });
  app.use('/api', limiters.global);
  // Per-IP limits on the routes that cost something (storage, YouCam units, the language model). Each runs before the route.
  app.put('/api/sessions/me/photos/:kind', limiters.uploads);
  app.post('/api/sessions/me/skin-profile', limiters.skin);
  app.post('/api/sessions/me/looks', limiters.renders);
  app.post('/api/sessions/me/looks/:lookId/render', limiters.renders);
  app.post('/api/sessions/me/agent/turn', limiters.agent);
  app.use('/api/share', limiters.share);

  app.use(sessionRoutes(deps));
  // Services first: the intake routes tell the render service when a photo changes.
  const skin = deps.skin ?? createSkinService(deps);
  const catalogs = deps.catalogs ?? createDefaultCatalogService(deps);
  const metrics = deps.metrics ?? createMetrics({ store: createMemoryStatStore(), sessions: deps.sessions, logger });
  const planner = deps.planner ?? createPlannerService({ catalogs, skin, metrics });
  const renders = deps.renders ?? createRenderService({
    ...deps, catalogs, skin, metrics,
    safeFetcher: createSafeFetcher({ maxBytes: RENDER_LIMITS.garmentMaxBytes, timeoutMs: RENDER_LIMITS.garmentTimeoutMs, maxRedirects: LIMITS.maxRedirects }),
  });
  const agent = deps.agent ?? createAgentService({
    config, logger, sessions: deps.sessions, catalogs, skin, renders, ledger: deps.ledger, metrics,
    llm: deps.llm ?? createLlm({ config: config.agent?.llm, logger }),
  });
  const purger = deps.purger ?? createPurger({
    sessions: deps.sessions, storage: deps.storage, gateway: deps.gateway, ledger: deps.ledger, renders, agent, logger,
    deleteTasks: config.render?.deleteTasks !== false,
  });
  purger.attach({ renders, agent });
  app.use(systemRoutes({ ...deps, purger }));
  app.use(intakeRoutes({ ...deps, renders, agent, purger }));
  app.use(skinRoutes({ ...deps, skin }));
  // Accounts. Tests pass their own auth service; production passes one built over Mongo in index.js.
  const auth = deps.auth ?? createAuthService({ store: createMemoryAuthStore(), sessions: deps.sessions, config });
  app.use(catalogRoutes({ ...deps, catalogs }));
  app.use(authRoutes({ ...deps, auth, catalogs, purger, limiters }));
  app.use(retailerRoutes({ ...deps, auth, catalogs, metrics, limiters }));
  app.use(accountRoutes({ ...deps, auth, skin }));
  app.use(plannerRoutes({ ...deps, planner }));
  app.use(renderRoutes({ ...deps, renders }));
  app.use(agentRoutes({ ...deps, agent }));
  if (config.enableDevRoutes) app.use(devRoutes(deps));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
