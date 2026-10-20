import rateLimit from 'express-rate-limit';
import { resolveLimits } from '../config/limits.js';

const pass = (_req, _res, next) => next();

/** One limiter. `limit` of 0 means no limit. Over the limit: 429 RATE_LIMITED with a Retry-After header and a friendly message. */
export function ipLimiter({ name, windowMs, limit, message, logger }) {
  if (!limit) return pass;
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(req, res) {
      logger?.warn({ limiter: name, requestId: req.id, path: req.path }, 'per-IP limit reached');
      res.status(429).json({ error: { code: 'RATE_LIMITED', message, details: { limiter: name }, requestId: req.id } });
    },
  });
}

const MIN = 60_000;
const HOUR = 3_600_000;

/** The named limiters the app mounts in front of the expensive routes. */
export function createLimiters({ config, logger }) {
  const l = resolveLimits(config?.limits);
  const make = (name, windowMs, limit, message) => ipLimiter({ name, windowMs, limit, message, logger });
  return {
    global: make('requests', MIN, l.requestsPerMinute, 'Too many requests. Slow down for a moment.'),
    sessions: make('sessions', HOUR, l.sessionsPerHour, 'Too many sessions from this network. Try again later.'),
    uploads: make('uploads', HOUR, l.uploadsPerHour, 'You have uploaded a lot of photos this hour. Try again a little later.'),
    skin: make('skin', HOUR, l.skinPerHour, 'Skin tone readings are limited each hour on this network. Try again a little later.'),
    renders: make('renders', HOUR, l.rendersPerHour, 'Lots of looks have been drawn from this network this hour. Looks already drawn stay available. Try again a little later.'),
    agent: make('agent', HOUR, l.agentTurnsPerHour, 'You have asked for a lot of changes this hour. Try again a little later.'),
    share: make('share', MIN, l.shareViewsPerMinute, 'Too many views of shared looks. Try again in a moment.'),
    stats: make('stats', MIN, l.statsPerMinute, 'Too many requests for usage numbers. Try again in a moment.'),
  };
}
