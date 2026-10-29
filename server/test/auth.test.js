import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../src/services/auth/service.js';
import { createMemoryAuthStore } from '../src/services/auth/storeMemory.js';
import { hashPassword, passwordProblem, verifyPassword } from '../src/services/auth/passwords.js';
import { createMemorySessions } from './fakes.js';

// A cheap stand-in so the suite stays fast; passwords.js itself is tested separately below.
const fastHash = async (p) => `h:${p}`;
const fastVerify = async (p, h) => h === `h:${p}`;

function build({ sessionIds = [], now } = {}) {
  const store = createMemoryAuthStore(now ? { now } : {});
  const sessions = createMemorySessions(sessionIds);
  const auth = createAuthService({ store, sessions, config: { authTokenDays: 30 }, hash: fastHash, verify: fastVerify, ...(now ? { now } : {}) });
  return { store, sessions, auth };
}
const RETAILER = { email: 'Priya@Shop.in', password: 'Silk&Zari-2026', name: 'Priya', businessName: 'Priya Silks', phone: '98765 43210', city: 'Pune', website: 'priyasilks.in', gstin: '29abcde1234f1z5', acceptTerms: true };
const SHOPPER = { email: 'a@b.com', password: 'Another#Pass1', name: 'Asha', acceptRetention: true };
const fails = async (p, code, field) => assert.rejects(p, (e) => e.code === code && (!field || e.details?.field === field), `${code} ${field ?? ''}`);

test('passwords: scrypt hashes verify, differ each time, and reject wrong or malformed input', async () => {
  const h = await hashPassword('Correct horse 9');
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(h, await hashPassword('Correct horse 9'));
  assert.equal(await verifyPassword('Correct horse 9', h), true);
  assert.equal(await verifyPassword('correct horse 9', h), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
  assert.equal(await verifyPassword('x', undefined), false);
  assert.ok(!h.includes('Correct'));
});

test('passwords: length, common passwords and the email itself are refused', () => {
  assert.match(passwordProblem('short'), /at least 8/);
  assert.match(passwordProblem('password123'), /too common/);
  assert.match(passwordProblem('a@b.com1', { email: 'A@B.com1' }), /email/);
  assert.match(passwordProblem('aaaaaaaaaa'), /mix/);
  assert.equal(passwordProblem('Silk&Zari-2026'), null);
});

test('retailer sign-up collects and validates business details, and never stores the password', async () => {
  const { auth, store } = build();
  await fails(auth.registerRetailer({ ...RETAILER, email: 'nope' }), 'INVALID_INPUT', 'email');
  await fails(auth.registerRetailer({ ...RETAILER, phone: '12' }), 'INVALID_INPUT', 'phone');
  await fails(auth.registerRetailer({ ...RETAILER, gstin: 'BAD' }), 'INVALID_INPUT', 'gstin');
  await fails(auth.registerRetailer({ ...RETAILER, businessName: '' }), 'INVALID_INPUT', 'businessName');
  await fails(auth.registerRetailer({ ...RETAILER, acceptTerms: false }), 'INVALID_INPUT', 'acceptTerms');
  await fails(auth.registerRetailer({ ...RETAILER, password: 'password123' }), 'INVALID_INPUT', 'password');

  const out = await auth.registerRetailer(RETAILER);
  assert.equal(out.account.email, 'priya@shop.in');
  assert.equal(out.account.retailer.phone, '9876543210');
  assert.equal(out.account.retailer.website, 'https://priyasilks.in');
  assert.equal(out.account.retailer.gstin, '29ABCDE1234F1Z5');
  assert.match(out.account.retailer.code, /^r[0-9a-f]{4}/);
  assert.ok(!('passwordHash' in out.account));
  const stored = JSON.stringify([...store.accounts.values()]) + JSON.stringify([...store.tokens.values()]);
  assert.ok(!stored.includes(out.token), 'the token itself is never stored, only its hash');
  await fails(auth.registerRetailer(RETAILER), 'EMAIL_TAKEN', 'email');
});

test('sign-in: the right password works for the right account type, wrong ones all look the same', async () => {
  const { auth } = build();
  await auth.registerRetailer(RETAILER);
  const ok = await auth.login('retailer', { email: ' PRIYA@shop.in', password: RETAILER.password });
  assert.equal(ok.account.role, 'retailer');
  assert.equal(ok.session, undefined, 'retailers have no shopper session');
  const wrongPw = await auth.login('retailer', { email: RETAILER.email, password: 'nope-nope' }).catch((e) => e);
  const noUser = await auth.login('retailer', { email: 'who@shop.in', password: 'nope-nope' }).catch((e) => e);
  const wrongRole = await auth.login('shopper', { email: RETAILER.email, password: RETAILER.password }).catch((e) => e);
  for (const e of [wrongPw, noUser, wrongRole]) { assert.equal(e.code, 'BAD_CREDENTIALS'); assert.equal(e.message, wrongPw.message); }
});

test('tokens: authenticate by role, expire, log out, and are revoked on delete', async () => {
  let clock = new Date('2026-10-20T00:00:00Z');
  const { auth } = build({ now: () => clock });
  const { token } = await auth.registerRetailer(RETAILER);
  assert.ok(await auth.authenticate(token, { role: 'retailer' }));
  assert.equal(await auth.authenticate(token, { role: 'shopper' }), null);
  assert.equal(await auth.authenticate('ens_' + 'x'.repeat(40)), null);
  assert.equal(await auth.authenticate(''), null);
  await assert.rejects(auth.requireToken('bad'), { code: 'UNAUTHENTICATED' });

  // Use renews it: a token used every few weeks never lapses...
  clock = new Date('2026-11-10T00:00:00Z');
  assert.ok(await auth.authenticate(token));
  clock = new Date('2026-12-05T00:00:00Z'); // 25 days after last use: still fine
  assert.ok(await auth.authenticate(token));
  // ...but one left alone for over 30 days does lapse.
  clock = new Date('2027-02-01T00:00:00Z');
  assert.equal(await auth.authenticate(token), null);

  clock = new Date('2026-12-06T00:00:00Z');
  const fresh = await auth.login('retailer', { email: RETAILER.email, password: RETAILER.password });
  const { tokenHash } = await auth.authenticate(fresh.token);
  await auth.logout(tokenHash);
  assert.equal(await auth.authenticate(fresh.token), null);
});

test('shopper account: signing up keeps the anonymous session and everything in it', async () => {
  const { auth, sessions } = build({ sessionIds: ['anon-1'] });
  sessions.docs.get('anon-1').skinProfile = { skin: { hex: '#C08A5E' } };
  await fails(auth.registerShopper({ ...SHOPPER, acceptRetention: false }), 'INVALID_INPUT', 'acceptRetention');
  const out = await auth.registerShopper(SHOPPER, { adoptSessionId: 'anon-1' });
  assert.equal(out.session.sessionId, 'anon-1');
  assert.equal(out.session.adopted, true);
  const doc = sessions.docs.get('anon-1');
  assert.equal(doc.accountId, out.account.id);
  assert.deepEqual(doc.skinProfile, { skin: { hex: '#C08A5E' } });
  assert.ok(new Date(doc.expiresAt) > new Date(Date.now() + 300 * 86_400_000), 'kept for months, not a day');
});

test('shopper account: works without a session to adopt, and signing in on a new browser finds the saved one', async () => {
  const { auth, sessions } = build({ sessionIds: [] });
  const out = await auth.registerShopper({ ...SHOPPER, name: '' });
  assert.equal(out.session.adopted, false);
  assert.equal(out.account.name, '');
  const saved = out.session.sessionId;

  const back = await auth.login('shopper', { email: SHOPPER.email, password: SHOPPER.password }, { adoptSessionId: 'some-new-anon' });
  assert.equal(back.session.sessionId, saved);
  assert.equal(back.session.switched, true, 'the browser is told it moved to the saved session');
  assert.equal((await auth.sessionFor(back.account.id ? { _id: back.account.id, role: 'shopper' } : null)).sessionId, saved);
  await assert.rejects(auth.sessionFor({ _id: 'x', role: 'retailer' }), { code: 'FORBIDDEN' });

  // A session that already belongs to another account cannot be taken over.
  const other = build({ sessionIds: ['owned'] });
  other.sessions.docs.get('owned').accountId = 'someone-else';
  const o = await other.auth.registerShopper(SHOPPER, { adoptSessionId: 'owned' });
  assert.notEqual(o.session.sessionId, 'owned');
  assert.equal(sessions.docs.size, 1);
});

test('the same email can hold a shopper account and a retailer account, separately', async () => {
  const { auth } = build();
  await auth.registerRetailer(RETAILER);
  const s = await auth.registerShopper({ ...SHOPPER, email: RETAILER.email });
  assert.equal(s.account.role, 'shopper');
  assert.equal((await auth.login('retailer', RETAILER)).account.role, 'retailer');
});

test('repeated wrong passwords lock that account for a while, even from another address', async () => {
  const { auth } = build();
  await auth.registerShopper(SHOPPER);
  for (let i = 0; i < 8; i++) await fails(auth.login('shopper', { email: SHOPPER.email, password: 'wrong-wrong' }), 'BAD_CREDENTIALS');
  await fails(auth.login('shopper', { email: SHOPPER.email, password: 'wrong-wrong' }), 'TOO_MANY_ATTEMPTS');
  await fails(auth.login('shopper', { email: SHOPPER.email, password: SHOPPER.password }), 'TOO_MANY_ATTEMPTS');
});

test('change password signs other browsers out; delete needs the password', async () => {
  const { auth, store } = build();
  const first = await auth.registerShopper(SHOPPER);
  const second = await auth.login('shopper', SHOPPER);
  const me = await auth.authenticate(first.token);
  await fails(auth.changePassword(me.account, me.tokenHash, { current: 'wrong', next: 'Brand#New-Pass2' }), 'BAD_CREDENTIALS', 'current');
  await fails(auth.changePassword(me.account, me.tokenHash, { current: SHOPPER.password, next: 'short' }), 'INVALID_INPUT', 'next');
  await auth.changePassword(me.account, me.tokenHash, { current: SHOPPER.password, next: 'Brand#New-Pass2' });
  assert.ok(await auth.authenticate(first.token), 'this browser stays signed in');
  assert.equal(await auth.authenticate(second.token), null, 'the other one is signed out');
  await fails(auth.login('shopper', SHOPPER), 'BAD_CREDENTIALS');
  assert.ok(await auth.login('shopper', { email: SHOPPER.email, password: 'Brand#New-Pass2' }));

  await fails(auth.confirmPassword(me.account, 'nope'), 'BAD_CREDENTIALS', 'password');
  await auth.confirmPassword((await auth.authenticate(first.token)).account, 'Brand#New-Pass2');
  await auth.remove(me.account);
  assert.equal(store.accounts.size, 0);
  assert.equal(await auth.authenticate(first.token), null);
});
