import 'dotenv/config';
import mongoose from 'mongoose';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { boundedBucket } from './lib/tokenBucket.js';
import { RequestQueue } from './lib/requestQueue.js';
import { createYoucamClient } from './services/youcam/client.js';
import { createGateway } from './services/youcam/gateway.js';
import { createMongoLedger } from './services/ledger.js';
import { createSessionService } from './services/sessions.js';
import { createCloudinaryStorage } from './services/storage/cloudinary.js';
import { createApp } from './app.js';

let config;
try {
  config = loadEnv();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const logger = createLogger({ level: config.logLevel, isProd: config.isProd });

await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
logger.info('mongodb connected');

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
    sessionUnitCap: config.sessionUnitCap,
    globalDailyUnitCap: config.globalDailyUnitCap,
    pollIntervalMs: youcam.pollIntervalMs,
    taskTimeoutMs: youcam.taskTimeoutMs,
  },
});
const sessions = createSessionService({ ttlHours: config.sessionTtlHours });

const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
const app = createApp({
  config, logger, gateway, ledger, storage, queue, sessions,
  dbState: () => dbStates[mongoose.connection.readyState] ?? 'unknown',
});

const server = app.listen(config.port, () => logger.info({ port: config.port, env: config.env }, 'ensemble server listening'));

const shutdown = (signal) => {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
