import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError, asyncHandler } from '../lib/errors.js';
import { readImageInfo } from '../lib/imageInfo.js';
import { requireSession } from '../middleware/session.js';
import {
  AVOID_COLOURS, BUDGET, CONSENT_VERSION, MAX_PHOTO_BYTES, METALS, NOTES_MAX, OCCASIONS, OCCASION_TEXT_MAX,
  PHOTO_RULES, SAMPLE_MODELS, SILHOUETTES, publicIntakeConfig,
} from '../config/intake.js';

const KINDS = Object.keys(PHOTO_RULES);
const clean = (s) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const text = (max) => z.string().max(max).transform(clean);
const ids = (list) => list.map((x) => x.id);

export const consentSchema = z.object({
  over18: z.literal(true, { errorMap: () => ({ message: 'Confirm that you are 18 or older to continue.' }) }),
  ownPhotos: z.boolean().default(false),
});

export const preferencesSchema = z
  .object({
    occasion: z.enum([...ids(OCCASIONS), 'other']),
    occasionText: text(OCCASION_TEXT_MAX).default(''),
    budgetInr: z
      .number({ invalid_type_error: 'Enter your budget as a number of rupees.' })
      .int('Enter a whole number of rupees.')
      .min(BUDGET.min, `The smallest budget is ₹${BUDGET.min.toLocaleString('en-IN')}.`)
      .max(BUDGET.max, `The largest budget is ₹${BUDGET.max.toLocaleString('en-IN')}.`),
    silhouettes: z.array(z.enum(ids(SILHOUETTES))).max(SILHOUETTES.length).default([]),
    metal: z.enum(ids(METALS)).default('any'),
    avoidColours: z.array(z.enum(ids(AVOID_COLOURS))).max(AVOID_COLOURS.length).default([]),
    notes: text(NOTES_MAX).default(''),
  })
  .refine((v) => v.occasion !== 'other' || v.occasionText.length >= 3, {
    path: ['occasionText'],
    message: 'Describe the occasion in a few words.',
  });

function fail(res, parsed) {
  const issue = parsed.error.issues[0];
  throw new AppError('INVALID_INPUT', issue?.message || 'Some details are missing or invalid.', 400, {
    field: issue?.path?.join('.') || undefined,
  });
}

/** Checks a photo against the shared rules. Messages say what is wrong and what to do. */
export function validatePhoto(kind, buffer) {
  const rules = PHOTO_RULES[kind];
  const info = readImageInfo(buffer);
  if (!info) throw new AppError('BAD_FILE_TYPE', 'That file is not a JPG or PNG photo. Choose a different one.', 415);
  const short = Math.min(info.width, info.height);
  const long = Math.max(info.width, info.height);
  if (short < rules.minShortSide || long < rules.minLongSide) {
    throw new AppError(
      'PHOTO_TOO_SMALL',
      `That photo is ${info.width} by ${info.height} pixels. Use one at least ${rules.minShortSide} by ${rules.minLongSide} pixels, or the original from your camera.`,
      422,
      { width: info.width, height: info.height },
    );
  }
  if (rules.mustBePortrait && info.height < info.width * 1.2) {
    throw new AppError('PHOTO_NOT_PORTRAIT', 'The full-length photo needs to be upright (taller than wide) so your whole outfit fits. Use a portrait photo.', 422, {
      width: info.width, height: info.height,
    });
  }
  return info;
}

export function intakeRoutes({ config, sessions, storage, logger }) {
  const router = Router();
  const auth = requireSession(sessions);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });

  const presentAsset = (kind, a) => {
    if (!a) return null;
    const url = a.source === 'sample' ? `/samples/${a.sampleId}/${kind}.jpg` : a.publicId && storage.isConfigured() ? storage.signedUrl(a.publicId) : null;
    return { source: a.source, sampleId: a.sampleId ?? undefined, width: a.width, height: a.height, url };
  };

  const present = (s) => {
    const selfie = presentAsset('selfie', s.photos?.selfie);
    const body = presentAsset('body', s.photos?.body);
    const consent = s.consent ? { acceptedAt: s.consent.acceptedAt, over18: s.consent.over18, ownPhotos: s.consent.ownPhotos } : null;
    const preferences = s.preferences ?? null;
    return {
      expiresAt: s.expiresAt,
      consent,
      photos: { selfie, body },
      preferences,
      complete: Boolean(consent?.over18 && selfie && body && preferences),
    };
  };

  const needConsent = (s) => {
    if (!s.consent?.over18) throw new AppError('CONSENT_REQUIRED', 'Confirm the consent screen first, then add your photos.', 403);
  };

  router.get('/api/intake/config', (_req, res) => res.json(publicIntakeConfig()));

  router.get('/api/sessions/me', auth, (req, res) => res.json(present(req.session)));

  router.post(
    '/api/sessions/me/consent',
    auth,
    asyncHandler(async (req, res) => {
      const parsed = consentSchema.safeParse(req.body);
      if (!parsed.success) fail(res, parsed);
      const next = await sessions.patch(req.session._id, {
        set: { consent: { acceptedAt: new Date(), version: CONSENT_VERSION, over18: true, ownPhotos: parsed.data.ownPhotos } },
      });
      if (!next) throw new AppError('SESSION_EXPIRED', 'Your session has ended. Start again to continue.', 401);
      res.json(present(next));
    }),
  );

  router.put(
    '/api/sessions/me/photos/:kind',
    auth,
    upload.single('image'),
    asyncHandler(async (req, res) => {
      const kind = req.params.kind;
      if (!KINDS.includes(kind)) throw new AppError('NOT_FOUND', 'Photo type must be selfie or body.', 404);
      const s = req.session;
      needConsent(s);
      if (!s.consent.ownPhotos) throw new AppError('CONSENT_REQUIRED', 'Confirm these are photos of you before uploading. Or use a sample model.', 403);
      if (!req.file) throw new AppError('NO_FILE', 'Choose a photo to upload.', 400);
      if (!storage.isConfigured()) throw new AppError('STORAGE_NOT_CONFIGURED', 'Photo storage is not set up on the server yet.', 503);

      const info = validatePhoto(kind, req.file.buffer);
      const saved = await storage.saveBuffer({ sessionId: s._id, buffer: req.file.buffer, kind });

      const set = { [`photos.${kind}`]: { source: 'upload', publicId: saved.publicId, width: info.width, height: info.height, bytes: req.file.size, addedAt: new Date() } };
      const unset = [];
      // Never mix a sample photo with a real one.
      const other = kind === 'selfie' ? 'body' : 'selfie';
      const otherAsset = s.photos?.[other];
      if (otherAsset?.source === 'sample') unset.push(`photos.${other}`);

      let next;
      try {
        next = await sessions.patch(s._id, { set, unset });
      } catch (err) {
        await storage.deleteAsset(saved.publicId).catch(() => {});
        throw err;
      }
      if (!next) {
        await storage.deleteAsset(saved.publicId).catch(() => {});
        throw new AppError('SESSION_EXPIRED', 'Your session has ended. Start again to continue.', 401);
      }
      // Replace: remove the previous upload only after the new one is safely recorded.
      const old = s.photos?.[kind];
      if (old?.source === 'upload' && old.publicId && old.publicId !== saved.publicId) await storage.deleteAsset(old.publicId).catch((e) => logger.warn({ err: e.message }, 'old photo delete failed'));
      res.json(present(next));
    }),
  );

  router.delete(
    '/api/sessions/me/photos/:kind',
    auth,
    asyncHandler(async (req, res) => {
      const kind = req.params.kind;
      if (!KINDS.includes(kind)) throw new AppError('NOT_FOUND', 'Photo type must be selfie or body.', 404);
      const old = req.session.photos?.[kind];
      if (old?.source === 'upload' && old.publicId) await storage.deleteAsset(old.publicId);
      const next = await sessions.patch(req.session._id, { unset: [`photos.${kind}`] });
      if (!next) throw new AppError('SESSION_EXPIRED', 'Your session has ended. Start again to continue.', 401);
      res.json(present(next));
    }),
  );

  router.put(
    '/api/sessions/me/sample-model',
    auth,
    asyncHandler(async (req, res) => {
      needConsent(req.session);
      const id = req.body?.modelId;
      const model = SAMPLE_MODELS.find((m) => m.id === id);
      if (!model) throw new AppError('INVALID_INPUT', 'Choose one of the listed sample models.', 400, { field: 'modelId' });
      // Sample models replace any photos the person uploaded, so remove those from storage first.
      for (const kind of KINDS) {
        const a = req.session.photos?.[kind];
        if (a?.source === 'upload' && a.publicId) await storage.deleteAsset(a.publicId);
      }
      const addedAt = new Date();
      const next = await sessions.patch(req.session._id, {
        set: {
          'photos.selfie': { source: 'sample', sampleId: model.id, addedAt },
          'photos.body': { source: 'sample', sampleId: model.id, addedAt },
        },
      });
      if (!next) throw new AppError('SESSION_EXPIRED', 'Your session has ended. Start again to continue.', 401);
      res.json(present(next));
    }),
  );

  router.put(
    '/api/sessions/me/preferences',
    auth,
    asyncHandler(async (req, res) => {
      needConsent(req.session);
      const parsed = preferencesSchema.safeParse(req.body);
      if (!parsed.success) fail(res, parsed);
      const prefs = parsed.data;
      if (prefs.occasion !== 'other') prefs.occasionText = '';
      const next = await sessions.patch(req.session._id, { set: { preferences: prefs } });
      if (!next) throw new AppError('SESSION_EXPIRED', 'Your session has ended. Start again to continue.', 401);
      res.json(present(next));
    }),
  );

  // Delete everything: photos in storage first (so a failure leaves the session, and a retry possible), then the session.
  router.delete(
    '/api/sessions/me',
    auth,
    asyncHandler(async (req, res) => {
      let photosDeleted = 0;
      try {
        ({ deleted: photosDeleted } = await storage.deleteSession(req.session._id));
      } catch (err) {
        logger.error({ err: err.message, sessionId: req.session._id }, 'session photo delete failed');
        throw new AppError('DELETE_FAILED', 'We could not remove your photos just now. Nothing was lost. Try again in a moment.', 502);
      }
      await sessions.remove(req.session._id);
      res.json({ deleted: true, photosDeleted });
    }),
  );

  return router;
}
