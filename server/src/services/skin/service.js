import { AppError } from '../../lib/errors.js';
import { readImageInfo } from '../../lib/imageInfo.js';
import { SAMPLE_SKIN } from '../../config/skin.js';
import { classifySkin } from './classify.js';
import { describeShape, extractSkinSignals } from './extract.js';
import { DEPTH_IDS, UNDERTONE_IDS, buildStoredProfile, presentProfile } from './profile.js';

export const FEATURE = 'skin-tone-analysis';

/** Identity of the selfie a profile was made from. A different selfie means the cached profile no longer applies. */
export const selfieKey = (photo) => (photo ? (photo.source === 'sample' ? `sample:${photo.sampleId}` : `upload:${photo.publicId}`) : null);

const sessionGone = () => new AppError('SESSION_EXPIRED', 'Your session has ended. Start again to continue.', 401);

function unusableSelfie(err) {
  const reason = String(err.details?.code ?? '');
  const message = /face/i.test(reason)
    ? 'We could not find a clear face in your selfie. Retake it facing the camera in even light, with nothing covering your face.'
    : 'YouCam could not read that selfie. Try a different one taken in even daylight, facing the camera.';
  return new AppError('SELFIE_UNUSABLE', message, 422, { reason: reason || undefined });
}

export function createSkinService({ gateway, storage, sessions, logger }) {
  const inflight = new Map(); // sessionId -> Promise, so two requests never spend units twice

  const stillValid = (profile, session) => profile && profile.selfieKey === selfieKey(session.photos?.selfie);

  async function run(session, requestId, onEvent) {
    const selfie = session.photos?.selfie;
    const key = selfieKey(selfie);

    let stored;
    if (selfie.source === 'sample') {
      // Sample models never leave our server: the skin colour is fixed and goes through the same rules.
      const sample = SAMPLE_SKIN[selfie.sampleId];
      if (!sample) throw new AppError('INVALID_INPUT', 'That sample model is not available.', 400);
      stored = buildStoredProfile({ classification: classifySkin({ hex: sample.hex }), selfieKey: key, source: 'sample', signals: ['sample model'] });
    } else {
      if (!storage.isConfigured()) throw new AppError('STORAGE_NOT_CONFIGURED', 'Photo storage is not set up on the server yet.', 503);
      const buffer = await storage.readBuffer(selfie.publicId);
      const info = readImageInfo(buffer);
      if (!info) throw new AppError('BAD_FILE_TYPE', 'Your selfie could not be read. Upload it again.', 415);

      let result;
      try {
        result = await gateway.runTask({
          sessionId: session._id,
          requestId,
          feature: FEATURE,
          files: [{ field: 'src_file_id', buffer, fileName: 'selfie.jpg', contentType: info.format === 'png' ? 'image/png' : 'image/jpg' }],
          onEvent,
        });
      } catch (err) {
        if (err.code === 'TASK_FAILED') throw unusableSelfie(err);
        throw err;
      }

      const signals = extractSkinSignals(result.results);
      if (!signals) {
        // Keep the shape (keys only, no values) so the parser can be pinned to the real response.
        logger.error({ shape: describeShape(result.results), taskId: result.taskId }, 'skin tone result had no readable colour');
        throw new AppError('SKIN_NOT_READ', 'YouCam answered, but we could not read a skin colour from it. This is a problem on our side.', 502, {
          shape: describeShape(result.results),
          taskId: result.taskId,
        });
      }
      stored = buildStoredProfile({
        classification: classifySkin({ hex: signals.hex, apiUndertone: signals.apiUndertone }),
        selfieKey: key,
        source: 'youcam',
        units: result.units,
        unitsKnown: result.unitsKnown,
        taskId: result.taskId,
        signals: signals.signals,
      });
    }

    const set = { skinProfile: stored };
    if (session.accountId) {
      // A signed-in shopper keeps every reading, newest last (colour numbers and labels only), so they can look back later.
      const entry = { analysedAt: stored.analysedAt ?? new Date(), source: stored.source, skinHex: stored.skin?.hex ?? null, depth: stored.depth?.id ?? null, undertone: stored.undertone?.id ?? null };
      set.skinHistory = [...(session.skinHistory ?? []), entry].slice(-20);
    }
    const next = await sessions.patch(session._id, { set });
    if (!next) throw sessionGone();
    return next.skinProfile;
  }

  return {
    /** Returns the cached profile for the current selfie, or analyses it once. */
    async analyse(session, { requestId, onEvent } = {}) {
      if (!session.consent?.over18) throw new AppError('CONSENT_REQUIRED', 'Confirm the consent screen first.', 403);
      if (!session.photos?.selfie) throw new AppError('PHOTOS_REQUIRED', 'Add your selfie first, then we can read your skin tone.', 409);

      if (stillValid(session.skinProfile, session)) {
        return { stored: session.skinProfile, cached: true };
      }
      let job = inflight.get(session._id);
      if (!job) {
        job = run(session, requestId, onEvent).finally(() => inflight.delete(session._id));
        inflight.set(session._id, job);
      }
      return { stored: await job, cached: false };
    },

    /** The cached profile if it still matches the selfie, otherwise null. Never spends units. */
    current(session) {
      return stillValid(session.skinProfile, session) ? session.skinProfile : null;
    },

    async setOverride(session, { undertone, depth }) {
      const stored = this.current(session);
      if (!stored) throw new AppError('NO_PROFILE', 'Read your skin tone first, then adjust it.', 409);
      const ok = (v, ids) => v === null || v === undefined || ids.includes(v);
      if (!ok(undertone, UNDERTONE_IDS) || !ok(depth, DEPTH_IDS)) {
        throw new AppError('INVALID_INPUT', 'Choose one of the listed options.', 400, { field: undertone && !UNDERTONE_IDS.includes(undertone) ? 'undertone' : 'depth' });
      }
      // Only the keys that were sent change. Choosing what we already detected is not an override.
      const prev = stored.override ?? {};
      const override = { undertone: prev.undertone ?? null, depth: prev.depth ?? null };
      if (undertone !== undefined) override.undertone = undertone && undertone !== stored.undertone.id ? undertone : null;
      if (depth !== undefined) override.depth = depth && depth !== stored.depth.id ? depth : null;
      const next = await sessions.patch(session._id, override.undertone || override.depth ? { set: { 'skinProfile.override': override } } : { unset: ['skinProfile.override'] });
      if (!next) throw sessionGone();
      return next.skinProfile;
    },

    async clearOverride(session) {
      if (!this.current(session)) throw new AppError('NO_PROFILE', 'Read your skin tone first, then adjust it.', 409);
      const next = await sessions.patch(session._id, { unset: ['skinProfile.override'] });
      if (!next) throw sessionGone();
      return next.skinProfile;
    },

    present: (stored, session, opts) => presentProfile(stored, session.preferences, opts),
  };
}
