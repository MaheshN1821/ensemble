
import { initializeRuntime } from './runtime.js';

let runtimePromise;

async function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = initializeRuntime().catch((error) => {
      // Allow a later invocation to retry initialization
      runtimePromise = null;
      throw error;
    });
  }

  return runtimePromise;
}

export default async function handler(req, res) {
  try {
    const { app } = await getRuntime();

    return app(req, res);
  } catch (error) {
    console.error('Application initialization failed:', error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
