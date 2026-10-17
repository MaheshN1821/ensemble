import pino from 'pino';

export function createLogger({ level = 'info', isProd = false } = {}) {
  return pino({
    level,
    redact: ['req.headers.authorization', 'req.headers["x-session-id"]'],
    ...(isProd ? {} : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
  });
}
