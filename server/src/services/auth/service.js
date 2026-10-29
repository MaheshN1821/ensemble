import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { changePasswordSchema, loginSchema, parse, retailerRegisterSchema, shopperRegisterSchema } from './schemas.js';

const DAY = 86_400_000;
const sha = (token) => createHash('sha256').update(token).digest('hex');
const newToken = () => `ens_${randomBytes(32).toString('base64url')}`;
const newId = () => randomBytes(12).toString('base64url');
const BAD_LOGIN = () => new AppError('BAD_CREDENTIALS', 'That email and password do not match. Check them and try again.', 401);
const NEED_SIGN_IN = () => new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401);

const ATTEMPTS = { max: 8, windowMs: 15 * 60_000 };

/**
 * Accounts for retailers and (optionally) shoppers.
 *
 * Passwords are scrypt-hashed. Signing in returns a random token that the browser keeps; only its SHA-256 is stored, and it
 * stops working after `authTokenDays` without use. Failed sign-ins are counted per account as well as per IP (the IP limit
 * is in the route), so guessing one password across many addresses is slowed too.
 *
 * `sessions` is the shopper session service: a shopper account owns one long-lived session, which holds their photos,
 * skin reading and looks. A person who was already using the site anonymously keeps that work when they create an account.
 */
export function createAuthService({ store, sessions, config = {}, now = () => new Date(), hash = hashPassword, verify = verifyPassword }) {
  const tokenMs = (config.authTokenDays ?? 30) * DAY;
  const failures = new Map(); // `${role}:${email}` -> { count, first }
  let dummyHash = null; // checked when the email is unknown, so "no such account" takes as long as "wrong password"

  const present = (a) => ({
    id: a._id,
    role: a.role,
    email: a.email,
    name: a.name ?? '',
    createdAt: a.createdAt,
    retailer: a.retailer
      ? { code: a.retailer.code, businessName: a.retailer.businessName, phone: a.retailer.phone, city: a.retailer.city, website: a.retailer.website ?? null, gstin: a.retailer.gstin ?? null }
      : undefined,
  });

  async function issueToken(account) {
    const token = newToken();
    const t = now();
    await store.insertToken({ _id: sha(token), accountId: account._id, role: account.role, createdAt: t, lastUsedAt: t, expiresAt: new Date(t.getTime() + tokenMs) });
    return { token, expiresAt: new Date(t.getTime() + tokenMs) };
  }

  function throttle(key) {
    const f = failures.get(key);
    if (f && now().getTime() - f.first > ATTEMPTS.windowMs) failures.delete(key);
    const cur = failures.get(key);
    if (cur && cur.count >= ATTEMPTS.max) {
      const waitMin = Math.max(1, Math.ceil((ATTEMPTS.windowMs - (now().getTime() - cur.first)) / 60_000));
      throw new AppError('TOO_MANY_ATTEMPTS', `Too many wrong passwords for this account. Wait ${waitMin} minute${waitMin === 1 ? '' : 's'} and try again.`, 429);
    }
  }
  const noteFailure = (key) => {
    if (failures.size > 5000) failures.clear();
    const cur = failures.get(key);
    failures.set(key, cur ? { ...cur, count: cur.count + 1 } : { count: 1, first: now().getTime() });
  };

  async function newRetailerCode() {
    for (let i = 0; i < 10; i++) {
      const code = `r${randomBytes(4).toString('hex').slice(0, 5)}`; // e.g. r3fa09
      if (!(await store.retailerCodeTaken(code))) return code;
    }
    throw new AppError('SERVER_ERROR', 'We could not finish creating your account. Try again.', 500);
  }

  async function createAccount(doc) {
    try {
      return await store.insertAccount(doc);
    } catch (e) {
      if (e?.code === 11000) throw new AppError('EMAIL_TAKEN', `There is already ${doc.role === 'retailer' ? 'a retailer' : 'a shopper'} account with that email. Sign in instead.`, 409, { field: 'email' });
      throw e;
    }
  }

  /** Gives a shopper their saved session: the one they already have, else the anonymous one they were using, else a new one. */
  async function attachSession(account, adoptId) {
    const existing = await sessions.findByAccount(account._id);
    if (existing) {
      const kept = await sessions.extendForAccount(existing._id);
      return { sessionId: existing._id, expiresAt: kept?.expiresAt ?? existing.expiresAt, adopted: false, switched: Boolean(adoptId && adoptId !== existing._id) };
    }
    if (adoptId) {
      const adopted = await sessions.adoptForAccount(adoptId, account._id);
      if (adopted) return { sessionId: adopted._id, expiresAt: adopted.expiresAt, adopted: true, switched: false };
    }
    const created = await sessions.createForAccount(account._id);
    return { sessionId: created.id, expiresAt: created.expiresAt, adopted: false, switched: false };
  }

  async function sessionResult(account, adoptId) {
    if (account.role !== 'shopper') return {};
    const s = await attachSession(account, adoptId);
    return { session: s };
  }

  return {
    present,

    async registerRetailer(body) {
      const v = parse(retailerRegisterSchema, body);
      const t = now();
      const account = await createAccount({
        _id: newId(), role: 'retailer', email: v.email, name: v.name, passwordHash: await hash(v.password),
        retailer: { code: await newRetailerCode(), businessName: v.businessName, phone: v.phone, city: v.city, website: v.website, gstin: v.gstin },
        termsAcceptedAt: t, createdAt: t, lastLoginAt: t,
      });
      return { ...(await issueToken(account)), account: present(account) };
    },

    /** `adoptSessionId`: the anonymous session this browser was using, so its photos, skin reading and looks join the account. */
    async registerShopper(body, { adoptSessionId = null } = {}) {
      const v = parse(shopperRegisterSchema, body);
      const t = now();
      const account = await createAccount({
        _id: newId(), role: 'shopper', email: v.email, name: v.name, passwordHash: await hash(v.password),
        retailer: null, termsAcceptedAt: t, createdAt: t, lastLoginAt: t,
      });
      return { ...(await issueToken(account)), account: present(account), ...(await sessionResult(account, adoptSessionId)) };
    },

    async login(role, body, { adoptSessionId = null } = {}) {
      if (role !== 'retailer' && role !== 'shopper') throw new AppError('NOT_FOUND', 'Unknown account type.', 404);
      const v = parse(loginSchema, body);
      const key = `${role}:${v.email}`;
      throttle(key);
      const account = await store.findAccount(v.email, role);
      if (!account) {
        dummyHash ??= await hash('not-a-real-password');
        await verify(v.password, dummyHash);
        noteFailure(key);
        throw BAD_LOGIN();
      }
      if (!(await verify(v.password, account.passwordHash))) { noteFailure(key); throw BAD_LOGIN(); }
      failures.delete(key);
      await store.updateAccount(account._id, { lastLoginAt: now() });
      return { ...(await issueToken(account)), account: present(account), ...(await sessionResult(account, adoptSessionId)) };
    },

    /** The account behind a bearer token, or null. A token in use is renewed (at most once a day, so reads stay cheap). */
    async authenticate(token, { role } = {}) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
      const hashed = sha(token);
      const row = await store.findToken(hashed);
      if (!row || (role && row.role !== role)) return null;
      const account = await store.getAccount(row.accountId);
      if (!account) { await store.deleteToken(hashed); return null; }
      const t = now();
      if (t.getTime() - new Date(row.lastUsedAt).getTime() > DAY) await store.touchToken(hashed, { lastUsedAt: t, expiresAt: new Date(t.getTime() + tokenMs) });
      return { account, tokenHash: hashed };
    },

    requireToken(token, opts) {
      return this.authenticate(token, opts).then((r) => { if (!r) throw NEED_SIGN_IN(); return r; });
    },

    /** The shopper's saved session, for a signed-in browser that opened the site fresh (new tab, or the browser was closed). */
    async sessionFor(account) {
      if (account.role !== 'shopper') throw new AppError('FORBIDDEN', 'Only shopper accounts have a saved session.', 403);
      return (await attachSession(account, null));
    },

    async logout(tokenHash) { await store.deleteToken(tokenHash); },

    /** Changes the password and signs every other browser out. */
    async changePassword(account, tokenHash, body) {
      const v = parse(changePasswordSchema, body);
      const key = `pw:${account._id}`;
      throttle(key);
      if (!(await verify(v.current, account.passwordHash))) { noteFailure(key); throw new AppError('BAD_CREDENTIALS', 'Your current password is not right.', 401, { field: 'current' }); }
      failures.delete(key);
      await store.updateAccount(account._id, { passwordHash: await hash(v.next), passwordChangedAt: now() });
      await store.deleteTokensFor(account._id, { except: tokenHash });
      return { changed: true };
    },

    /** Checks the password before an account is deleted. The caller removes the account's data, then calls `remove`. */
    async confirmPassword(account, password) {
      const key = `del:${account._id}`;
      throttle(key);
      if (typeof password !== 'string' || !(await verify(password, account.passwordHash))) { noteFailure(key); throw new AppError('BAD_CREDENTIALS', 'Enter your password to confirm.', 401, { field: 'password' }); }
      failures.delete(key);
    },

    async remove(account) {
      await store.deleteTokensFor(account._id);
      await store.deleteAccount(account._id);
    },
  };
}
