import { AppError, asyncHandler } from '../lib/errors.js';

export const requireSession = (sessions) =>
  asyncHandler(async (req, _res, next) => {
    const id = req.get('x-session-id');
    const session = await sessions.get(id);
    if (!session) throw new AppError('SESSION_EXPIRED', 'Your session has ended. Start again to continue.', 401);
    req.session = session;
    next();
  });
