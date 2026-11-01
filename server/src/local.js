
import mongoose from 'mongoose';
import { initializeRuntime } from './api/runtime.js';

async function start() {
  const {
    app,
    config,
    logger,
    purger,
    loadCatalog,
    sweep
  } = await initializeRuntime();

  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, env: config.env },
      'ensemble server listening'
    );
  });

  // Background jobs are enabled for local development
  purger.start({
    intervalMs: config.sessionSweepMinutes * 60_000
  });

  const catalogInterval = setInterval(() => {
    sweep();
    loadCatalog();
  }, 3_600_000);

  catalogInterval.unref();

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');

    clearInterval(catalogInterval);
    purger.stop();

    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });

    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error('Server startup failed:', error);
  process.exit(1);
});
