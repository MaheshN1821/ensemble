import { Router } from 'express';
import { AppError, asyncHandler } from '../lib/errors.js';
import { bearerToken, requireAccount } from '../middleware/auth.js';
import { shortId } from '../lib/logIds.js';

const ROLES = ['retailer', 'shopper'];

/**
 * Sign-up, sign-in and account management for retailers and shoppers. Shopper accounts are optional: every shopper
 * feature works without one. A shopper who signs up keeps the anonymous session they were using (photos, skin reading, looks).
 */
export function authRoutes({ config, auth, catalogs, sessions, purger, logger, limiters }) {
  const router = Router();
  const anyAccount = requireAccount(auth);
  const role = (req) => {
    if (!ROLES.includes(req.params.role)) throw new AppError('NOT_FOUND', 'Unknown account type.', 404);
    return req.params.role;
  };
  const sessionBody = (s) => (s ? { sessionId: s.sessionId, expiresAt: s.expiresAt, caps: { units: config.sessionUnitCap }, adopted: s.adopted, switched: s.switched } : undefined);
  const reply = (out) => ({ token: out.token, expiresAt: out.expiresAt, account: out.account, session: sessionBody(out.session) });
  const anonymousSessionId = (req) => req.get('x-session-id') || null;

  router.post('/api/auth/:role/register', limiters.register, asyncHandler(async (req, res) => {
    const r = role(req);
    const out = r === 'retailer' ? await auth.registerRetailer(req.body) : await auth.registerShopper(req.body, { adoptSessionId: anonymousSessionId(req) });
    logger.info({ role: r, account: shortId(out.account.id), adopted: out.session?.adopted }, 'account created');
    res.status(201).json(reply(out));
  }));

  router.post('/api/auth/:role/login', limiters.login, asyncHandler(async (req, res) => {
    const r = role(req);
    const out = await auth.login(r, req.body, { adoptSessionId: anonymousSessionId(req) });
    res.json(reply(out));
  }));

  // Who am I, and (for a shopper) which saved session is mine. The browser calls this when it opens with a stored token.
  router.get('/api/auth/me', anyAccount, asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session = req.account.role === 'shopper' ? await auth.sessionFor(req.account) : undefined;
    res.json({ account: auth.present(req.account), session: sessionBody(session) });
  }));

  router.post('/api/auth/logout', anyAccount, asyncHandler(async (req, res) => {
    await auth.logout(req.tokenHash);
    res.json({ signedOut: true });
  }));

  router.post('/api/auth/password', anyAccount, limiters.login, asyncHandler(async (req, res) => {
    res.json(await auth.changePassword(req.account, req.tokenHash, req.body));
  }));

  // Deletes the account and everything it owns: a retailer's items, images and uploads; a shopper's photos, skin readings and looks.
  router.delete('/api/auth/account', anyAccount, limiters.login, asyncHandler(async (req, res) => {
    await auth.confirmPassword(req.account, req.body?.password);
    if (req.account.role === 'retailer') {
      await catalogs.removeAllForRetailer(req.account);
    } else {
      const saved = await sessions.findByAccount(req.account._id);
      if (saved) {
        try { await purger.purge(saved, { tasks: 'background' }); } catch (err) {
          logger.error({ err: err.message, sid: shortId(saved._id) }, 'account photo delete failed');
          throw new AppError('DELETE_FAILED', 'We could not remove your photos just now. Nothing was lost. Try again in a moment.', 502);
        }
        await sessions.remove(saved._id);
      }
    }
    await auth.remove(req.account);
    res.json({ deleted: true });
  }));

  return router;
}
