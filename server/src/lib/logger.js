import pino from 'pino';

// Structured logs (JSON in production, pretty in development). Every request line carries the request id; lines about a
// session carry a one-way fingerprint (`sid`), never the session id, a catalog token or a share token.
export function createLogger({ level = 'info', isProd = false } = {}) {
  return pino({
    level,
    base: { service: 'ensemble-server' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: {
      paths: [
        'req.headers.authorization', 'req.headers.cookie', 'req.headers["x-session-id"]',
        'headers.authorization', 'headers["x-session-id"]',
      ],
      censor: '[redacted]',
    },
    ...(isProd ? {} : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
  });
}
