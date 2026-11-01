
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
import {
  DEFAULT_FEATURES,
  DOCUMENTED_UNITS
} from '../config/render.js';

import { createMetrics } from '../services/metrics/service.js';
import { createMongoStatStore } from '../services/metrics/store.js';
import { createPurger } from '../services/privacy/purge.js';
import { Session } from '../models/Session.js';

import { createApp } from './app.js';


export async function initializeRuntime() {

  // 1. Load configuration
  const config = loadEnv();

  const logger = createLogger({
    level: config.logLevel,
    isProd: config.isProd
  });

  // 2. Connect MongoDB
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10_000
  });

  logger.info('mongodb connected');

  await Session.syncIndexes().catch((err) =>
    logger.warn(
      { err: err.message },
      'session index sync failed'
    )
  );

  // 3. Initialize YouCam request queue
  const { youcam } = config;

  const queue = new RequestQueue({
    concurrency: youcam.concurrency,
    buckets: [
      boundedBucket({
        name: 'per-second',
        limit: youcam.ratePerSecond,
        windowSeconds: 1
      }),
      boundedBucket({
        name: 'per-window',
        limit: youcam.ratePerWindow,
        windowSeconds: youcam.windowSeconds
      })
    ]
  });

  // 4. Initialize storage and YouCam services
  const ledger = createMongoLedger();

  const storage = createCloudinaryStorage(
    config.cloudinary,
    logger
  );

  const client = createYoucamClient({
    apiKey: youcam.apiKey,
    baseUrl: youcam.baseUrl
  });

  const gateway = createGateway({
    client,
    queue,
    ledger,
    storage,
    logger,
    config: {
      unitOverrides: youcam.unitOverrides,
      unknownFeatureUnits: youcam.unknownFeatureUnits,

      documentedUnits: Object.fromEntries(
        Object.keys(DOCUMENTED_UNITS).map((slot) => [
          config.render.features[slot] ?? DEFAULT_FEATURES[slot],
          DOCUMENTED_UNITS[slot]
        ])
      ),

      sessionUnitCap: config.sessionUnitCap,
      globalDailyUnitCap: config.globalDailyUnitCap,
      pollIntervalMs: youcam.pollIntervalMs,
      taskTimeoutMs: youcam.taskTimeoutMs
    }
  });

  // 5. Initialize session and authentication services
  const sessions = createSessionService({
    ttlHours: config.sessionTtlHours,
    accountDays: config.accountSessionDays
  });

  const auth = createAuthService({
    store: createMongoAuthStore(),
    sessions,
    config
  });

  // 6. Initialize metrics
  const metrics = createMetrics({
    store: createMongoStatStore(),
    sessions,
    logger
  });

  // 7. Initialize catalog services
  const catalogs = createCatalogService({
    repo: createMongoCatalogRepo(),

    importer: createImporter({
      fetcher: createSafeFetcher({
        maxBytes: LIMITS.maxImageBytes,
        timeoutMs: LIMITS.imageTimeoutMs,
        maxRedirects: LIMITS.maxRedirects
      }),
      storage,
      logger
    }),

    storage,
    metrics,
    sessions,
    config,
    logger
  });

  // 8. Catalog initialization
  const loadCatalog = () =>
    catalogs.ensureMain().catch((err) =>
      logger.error(
        { err: err.message },
        'could not load the built-in catalog'
      )
    );

  await loadCatalog();

  // 9. Catalog expiry sweep
  const sweep = () =>
    catalogs.sweepExpired().catch((err) =>
      logger.error(
        { err: err.message },
        'catalog sweep failed'
      )
    );

  // Run once during initialization
  await sweep();

  // 10. Initialize privacy purger
  const purger = createPurger({
    sessions,
    storage,
    gateway,
    ledger,
    logger,
    deleteTasks: config.render.deleteTasks
  });

  // 11. Create Express application
  const dbStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const app = createApp({
    config,
    logger,
    gateway,
    ledger,
    storage,
    queue,
    sessions,
    auth,
    catalogs,
    metrics,
    purger,
    dbState: () =>
      dbStates[mongoose.connection.readyState] ?? 'unknown'
  });

  // Return everything required by the entry points
  return {
    app,
    config,
    logger,
    purger,
    catalogs,
    loadCatalog,
    sweep
  };
}
