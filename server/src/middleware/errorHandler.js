import { AppError } from '../lib/errors.js';
import { YoucamError } from '../services/youcam/client.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such route.', requestId: req.id } });
}

// Maps internal failures to friendly, specific messages. Never leaks keys or upstream bodies.
export function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    let status = 500;
    let code = 'INTERNAL';
    let message = 'Something went wrong on our side. Try again in a moment.';
    let details;

    if (err instanceof AppError) {
      ({ status, code, message, details } = err);
    } else if (err instanceof YoucamError) {
      if (err.status === 429) {
        status = 429; code = 'RATE_LIMITED'; message = 'Lots of people are trying looks right now. Try again in a few seconds.';
      } else if (err.status === 401 || err.status === 403) {
        status = 502; code = 'YOUCAM_AUTH'; message = 'The try-on service rejected our credentials.';
      } else {
        status = 502; code = 'YOUCAM_UNAVAILABLE'; message = 'The try-on service did not respond as expected. Try again.';
      }
    } else if (err?.code === 'LIMIT_FILE_SIZE') {
      status = 413; code = 'FILE_TOO_LARGE'; message = 'That photo is over 10 MB. Choose a smaller file.';
    } else if (err?.type === 'entity.too.large') {
      status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'That request is too large.';
    }

    const log = status >= 500 ? 'error' : 'warn';
    logger[log]({ err: { message: err.message, code: err.code, status: err.status }, requestId: req.id }, 'request failed');
    res.status(status).json({ error: { code, message, details, requestId: req.id } });
  };
}
