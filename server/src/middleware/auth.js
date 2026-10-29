import { asyncHandler } from '../lib/errors.js';

/** The token from "Authorization: Bearer <token>", or ''. */
export const bearerToken = (req) => /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '')?.[1] ?? '';

/** Requires a signed-in account (of `role`, when given). Sets req.account and req.tokenHash. */
export const requireAccount = (auth, role) =>
  asyncHandler(async (req, _res, next) => {
    const { account, tokenHash } = await auth.requireToken(bearerToken(req), { role });
    req.account = account;
    req.tokenHash = tokenHash;
    next();
  });
