import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt from Node's own crypto: no native module to build on the host, and memory-hard like bcrypt/argon2.
const PARAMS = { N: 16384, r: 8, p: 1, keyLen: 64 };
const derive = (password, salt, { N, r, p, keyLen }) =>
  new Promise((resolve, reject) => {
    scrypt(String(password).normalize('NFKC'), salt, keyLen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });

/** "scrypt$N$r$p$salt$hash". The parameters travel with the hash, so they can be raised later without locking anyone out. */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, saltB64, keyB64] = String(stored ?? '').split('$');
  if (alg !== 'scrypt' || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await derive(password, Buffer.from(saltB64, 'base64'), { N: Number(N), r: Number(r), p: Number(p), keyLen: expected.length });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const COMMON = new Set(['password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'abc12345', 'admin123', 'welcome1', 'letmein1', 'ensemble1', 'ensemble123']);

/** A plain-language reason the password is not allowed, or null. Length and a short blocklist: enough to stop the worst choices. */
export function passwordProblem(password, { email = '' } = {}) {
  const pw = String(password ?? '');
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 128) return 'Use at most 128 characters.';
  if (/^\s+$/.test(pw)) return 'Use something other than spaces.';
  if (COMMON.has(pw.toLowerCase())) return 'That password is too common. Choose something harder to guess.';
  if (email && pw.toLowerCase() === String(email).toLowerCase()) return 'Your password cannot be your email address.';
  if (/^(.)\1+$/.test(pw)) return 'Use a mix of characters, not one repeated.';
  return null;
}
