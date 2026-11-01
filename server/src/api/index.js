import 'dotenv/config';
import mongoose from 'mongoose';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';
import { boundedBucket } from '../lib/tokenBucket.js';
import { RequestQueue } from '../lib/requestQueue.js';
import { createYoucamClient } from '../services/youcam/client.js';
import { createGateway } from '../services/youcam/gateway.js';
import { createMongoLedger } from '../services/ledger.js';
import { createSessionService } from '../services/sessions.js';
import { createAuthService } from '../services/auth/service.js';
import { createMongoAuthStore } from '../services/auth/store.js';
import { createCloudinaryStorage } from '../services/storage/cloudinary.js';
import { createMongoCatalogRepo } from '../services/catalog/repo.js';
import { createCatalogService } from '../services/catalog/service.js';
import { createImporter } from '../services/catalog/importer.js';
import { createSafeFetcher } from '../lib/safeFetch.js';
import { LIMITS } from '../config/catalog.js';
import { DEFAULT_FEATURES, DOCUMENTED_UNITS } from '../config/render.js';
import { createMetrics } from '../services/metrics/service.js';
import { createMongoStatStore } from '../services/metrics/store.js';
import { createPurger } from '../services/privacy/purge.js';
import { Session } from '../models/Session.js';
import { createApp } from './app.js';

let config;
try {
  config = loadEnv();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const logger = createLogger({ level: config.logLevel, isProd: config.isProd });

// Last-resort logging, so a crash leaves a structured line with a reason instead of a bare stack trace.
process.on('unhandledRejection', (reason) => logger.error({ err: reason instanceof Error ? reason.message : String(reason) }, 'unhandled promise rejection'));
process.on('uncaughtException', (err) => { logger.fatal({ err: err.message }, 'uncaught exception'); process.exit(1); });

await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
logger.info('mongodb connected');
// Stage 9: sessions are no longer removed by a Mongo TTL index (it would delete the record before the stored images).
// syncIndexes drops the old TTL index on first boot and builds the plain one.
await Session.syncIndexes().catch((err) => logger.warn({ err: err.message }, 'session index sync failed'));

const { youcam } = config;
const queue = new RequestQueue({
  concurrency: youcam.concurrency,
  buckets: [
    boundedBucket({ name: 'per-second', limit: youcam.ratePerSecond, windowSeconds: 1 }),
    boundedBucket({ name: 'per-window', limit: youcam.ratePerWindow, windowSeconds: youcam.windowSeconds }),
  ],
});

const ledger = createMongoLedger();
const storage = createCloudinaryStorage(config.cloudinary, logger);
const client = createYoucamClient({ apiKey: youcam.apiKey, baseUrl: youcam.baseUrl });
const gateway = createGateway({
  client,
  queue,
  ledger,
  storage,
  logger,
  config: {
    unitOverrides: youcam.unitOverrides,
    unknownFeatureUnits: youcam.unknownFeatureUnits,
    // Prices printed in the YouCam docs, used only when the live price list cannot be matched.
    documentedUnits: Object.fromEntries(Object.keys(DOCUMENTED_UNITS).map((slot) => [config.render.features[slot] ?? DEFAULT_FEATURES[slot], DOCUMENTED_UNITS[slot]])),
    sessionUnitCap: config.sessionUnitCap,
    globalDailyUnitCap: config.globalDailyUnitCap,
    pollIntervalMs: youcam.pollIntervalMs,
    taskTimeoutMs: youcam.taskTimeoutMs,
  },
});
const sessions = createSessionService({ ttlHours: config.sessionTtlHours, accountDays: config.accountSessionDays });
const auth = createAuthService({ store: createMongoAuthStore(), sessions, config });
const metrics = createMetrics({ store: createMongoStatStore(), sessions, logger });

const catalogs = createCatalogService({
  repo: createMongoCatalogRepo(),
  importer: createImporter({
    fetcher: createSafeFetcher({ maxBytes: LIMITS.maxImageBytes, timeoutMs: LIMITS.imageTimeoutMs, maxRedirects: LIMITS.maxRedirects }),
    storage,
    logger,
  }),
  storage,
  metrics,
  sessions,
  config,
  logger,
});
// The shared catalog: created from data/seedCatalog.json on first boot, and re-applied whenever that file changes.
// A failure here must not take the API down (shoppers would see "catalog not loaded" and it retries every hour).
const loadCatalog = () => catalogs.ensureMain().catch((err) => logger.error({ err: err.message }, 'could not load the built-in catalog'));
await loadCatalog();
// Private catalogs from before accounts existed are removed when they expire. Sweep once at boot, then hourly.
const sweep = () => catalogs.sweepExpired().catch((err) => logger.error({ err: err.message }, 'catalog sweep failed'));
sweep();
setInterval(() => { sweep(); loadCatalog(); }, 3_600_000).unref();

if (!config.shareSecret) logger.warn('SHARE_SECRET is not set: share links use a random secret and stop working when the server restarts');

// Expired sessions are deleted here: stored photos and drawn images, YouCam tasks, then the record. At boot, then on a timer.
const purger = createPurger({ sessions, storage, gateway, ledger, logger, deleteTasks: config.render.deleteTasks });

const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
const app = createApp({
  config, logger, gateway, ledger, storage, queue, sessions, auth, catalogs, metrics, purger,
  dbState: () => dbStates[mongoose.connection.readyState] ?? 'unknown',
});

const server = app.listen(config.port, () => logger.info({ port: config.port, env: config.env }, 'ensemble server listening'));
purger.start({ intervalMs: config.sessionSweepMinutes * 60_000 });

const shutdown = (signal) => {
  logger.info({ signal }, 'shutting down');
  purger.stop();
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
