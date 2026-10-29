import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { passwordProblem } from './passwords.js';

const clean = (s) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const text = (label, min, max) =>
  z
    .string({ required_error: `Add your ${label}.`, invalid_type_error: `Add your ${label}.` })
    .transform(clean)
    .pipe(z.string().min(min, `Add your ${label}.`).max(max, `Keep your ${label} under ${max} characters.`));

const optionalName = z
  .union([z.undefined(), z.null(), z.string()])
  .transform((v) => clean(String(v ?? '')))
  .pipe(z.string().max(80, 'Keep your name under 80 characters.'));

const email = z
  .string({ required_error: 'Enter your email address.', invalid_type_error: 'Enter your email address.' })
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().max(254, 'That email address is too long.').email('Enter a valid email address, like name@example.com.'));

const password = z.string({ required_error: 'Choose a password.', invalid_type_error: 'Choose a password.' });

const phone = z
  .string({ required_error: 'Add a phone number.', invalid_type_error: 'Add a phone number.' })
  .transform((s) => s.replace(/[\s().-]/g, ''))
  .pipe(z.string().regex(/^\+?\d{10,15}$/, 'Enter a phone number with 10 to 15 digits, for example 9876543210.'));

const website = z
  .union([z.literal(''), z.null(), z.undefined(), z.string()])
  .transform((v, ctx) => {
    const raw = String(v ?? '').trim();
    if (!raw) return null;
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error();
      return u.toString().replace(/\/$/, '');
    } catch {
      ctx.addIssue({ code: 'custom', message: 'That website address is not valid. Leave it blank or use something like https://yourshop.in.' });
      return z.NEVER;
    }
  });

const gstin = z
  .union([z.literal(''), z.null(), z.undefined(), z.string()])
  .transform((v, ctx) => {
    const raw = String(v ?? '').replace(/\s/g, '').toUpperCase();
    if (!raw) return null;
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(raw)) {
      ctx.addIssue({ code: 'custom', message: 'A GSTIN has 15 characters, like 29ABCDE1234F1Z5. Leave it blank if you do not have one.' });
      return z.NEVER;
    }
    return raw;
  });

const withPassword = (shape) =>
  z.object(shape).superRefine((v, ctx) => {
    const problem = passwordProblem(v.password, { email: v.email });
    if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: problem });
  });

export const retailerRegisterSchema = withPassword({
  email,
  password,
  name: text('name', 2, 80),
  businessName: text('shop or brand name', 2, 80),
  phone,
  city: text('city', 2, 60),
  website,
  gstin,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Confirm that you have the right to use these product photos and details.' }) }),
});

export const shopperRegisterSchema = withPassword({
  email,
  password,
  name: optionalName,
  acceptRetention: z.literal(true, { errorMap: () => ({ message: 'Tick the box to keep your photos, colours and looks in your account.' }) }),
});

export const loginSchema = z.object({
  email,
  password: z.string({ required_error: 'Enter your password.', invalid_type_error: 'Enter your password.' }).min(1, 'Enter your password.').max(256),
});

export const changePasswordSchema = z
  .object({ current: z.string().min(1, 'Enter your current password.').max(256), next: password })
  .superRefine((v, ctx) => {
    const problem = passwordProblem(v.next);
    if (problem) ctx.addIssue({ code: 'custom', path: ['next'], message: problem });
    else if (v.next === v.current) ctx.addIssue({ code: 'custom', path: ['next'], message: 'Choose a password you have not used here before.' });
  });

/** Parses with a schema; the first problem becomes a 400 that names the field and says what to fix. */
export function parse(schema, body) {
  const out = schema.safeParse(body ?? {});
  if (out.success) return out.data;
  const issue = out.error.issues[0];
  throw new AppError('INVALID_INPUT', issue?.message || 'Some details are missing or invalid.', 400, { field: issue?.path?.join('.') || undefined });
}
