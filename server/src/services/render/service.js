import { randomBytes } from 'node:crypto';
import { AppError } from '../../lib/errors.js';
import { readImageInfo } from '../../lib/imageInfo.js';
import { BUDGET } from '../../config/intake.js';
import {
  DEFAULT_FEATURES, DOCUMENTED_UNITS, FACE_ORDER, LIMITS, STAGES, friendlyStageError, publicRenderConfig,
} from '../../config/render.js';
import { effectiveProfile } from '../skin/profile.js';
import { rescoreLook } from '../planner/plan.js';
import { photoKey, stageKey } from './keys.js';
import { VTO_STYLES, buildRequest } from './payloads.js';
import { createShareTokens } from './share.js';
import { presentLook, presentShared, snapshotOf } from './view.js';

const LOOK_ID = /^look_[a-f0-9]{10}$/;
const SLOTS = ['outfit', 'necklace', 'earrings', 'lipstick'];
const CAP_CODES = new Set(['SESSION_CAP', 'GLOBAL_CAP']);

class Aborted extends Error {
  constructor() { super('render aborted'); this.aborted = true; }
}

const sessionGone = () => new AppError('SESSION_EXPIRED', 'Your session has ended. Start again to continue.', 401);
const lookGone = () => new AppError('NOT_FOUND', 'That look is not in your session any more. Plan your looks again.', 404);
const shareGone = () => new AppError('SHARE_EXPIRED', 'This link has expired, or the look was deleted.', 404);
const jpegOrPng = (info) => (info.format === 'png' ? { contentType: 'image/png', ext: 'png' } : { contentType: 'image/jpg', ext: 'jpg' });

/**
 * Draws looks on the shopper's own photos (Stage 6).
 *
 *  - The body panel is one task (outfit). The face panel is a chain (earrings, necklace, lipstick), each drawing on the
 *    previous result. The two panels run side by side.
 *  - Every result is copied to our storage at once and cached under (feature, item, input image). A repeat costs nothing,
 *    and changing only the lipstick re-runs only the lipstick.
 *  - A failed stage costs nothing (YouCam charges on success). The look keeps the stages that worked, and a retry runs only
 *    what is missing, on top of the last good image, so nothing is drawn or charged twice.
 *  - One look is drawn at a time per session. Starting the same look again joins the running job.
 * The database holds metadata only: which items, which stage finished, and where the result is stored.
 */
export function createRenderService({
  gateway, storage, sessions, catalogs, skin, ledger, metrics, config = {}, logger,
  fetchOwn, safeFetcher, now = Date.now,
}) {
  const rc = config.render ?? {};
  const features = { ...DEFAULT_FEATURES, ...(rc.features ?? {}) };
  const deleteTasks = rc.deleteTasks !== false;
  const renderCap = rc.sessionRenderCap ?? LIMITS.defaultSessionRenderCap;
  const publicBase = String(config.publicClientUrl ?? '').replace(/\/$/, '');
  let vtoStyle = VTO_STYLES.includes(rc.vtoStyle) ? rc.vtoStyle : 'files'; // remembers what YouCam accepted
  const tokens = createShareTokens({ secret: config.shareSecret || randomBytes(32).toString('hex'), now });
  const log = logger ?? { info() {}, warn() {}, error() {} };

  const jobs = new Map(); // `${sessionId}:${lookId}` -> job
  const activeBySession = new Map(); // sessionId -> lookId
  const jobKey = (sid, lid) => `${sid}:${lid}`;

  // ---------- small utilities ----------

  const locks = new Map();
  function withLock(id, fn) {
    const prev = locks.get(id) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    locks.set(id, next);
    next.then(() => {}, () => {}).then(() => { if (locks.get(id) === next) locks.delete(id); });
    return next;
  }

  /**
   * Read-modify-write of the render fields of a session, one at a time per session. `fn(draft, session)` edits
   * draft.looks / draft.renderCache / draft.renderRuns. Returns { ok:false } when the session is gone.
   */
  function mutate(sessionId, fn) {
    return withLock(sessionId, async () => {
      const s = await sessions.get(sessionId);
      if (!s) return { ok: false };
      const draft = {
        looks: structuredClone(s.looks ?? []),
        renderCache: structuredClone(s.renderCache ?? []),
        renderRuns: s.renderRuns ?? 0,
      };
      const value = await fn(draft, s);
      const next = await sessions.patch(sessionId, { set: { looks: draft.looks, renderCache: draft.renderCache, renderRuns: draft.renderRuns } });
      return next ? { ok: true, value } : { ok: false };
    });
  }

  /** Removes cache entries no look refers to any more and returns the storage ids to delete. */
  function collectGarbage(draft) {
    const used = new Set();
    for (const l of draft.looks) {
      for (const st of Object.values(l.stages ?? {})) if (st?.key) used.add(st.key);
      for (const c of l.faceChain ?? []) used.add(c.key);
    }
    const orphans = draft.renderCache.filter((e) => !used.has(e.key));
    draft.renderCache = draft.renderCache.filter((e) => used.has(e.key));
    return orphans.map((e) => e.publicId).filter(Boolean);
  }

  const deleteAssets = async (ids) => {
    if (!ids?.length) return;
    try {
      if (storage.deleteAssets) await storage.deleteAssets(ids);
      else for (const id of ids) await storage.deleteAsset(id);
    } catch (err) {
      log.warn({ err: err.message }, 'render asset delete failed');
    }
  };

  const cacheMap = (session) => new Map((session.renderCache ?? []).map((e) => [e.key, e]));

  // ---------- loading images ----------

  /** Fetches one of our own static files (sample photos and sample catalog images live on the client origin). */
  async function defaultFetchOwn(url) {
    if (!publicBase || new URL(url).origin !== new URL(publicBase).origin) throw new Error('not our own origin');
    const res = await fetch(url, { signal: AbortSignal.timeout(LIMITS.garmentTimeoutMs) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > LIMITS.garmentMaxBytes) throw new Error('too large');
    return buffer;
  }
  const getOwn = fetchOwn ?? defaultFetchOwn;

  async function loadPhoto(job, kind, maxSide) {
    const photo = job.photos[kind];
    let buffer;
    try {
      if (photo.source === 'sample') buffer = await getOwn(`${publicBase}/samples/${photo.sampleId}/${kind}.jpg`);
      else buffer = await storage.readBuffer(photo.publicId, { maxSide });
    } catch (err) {
      log.error({ err: err.message, kind }, 'could not load photo for render');
      throw new AppError('PHOTO_UNREADABLE', `We could not read your ${kind === 'selfie' ? 'selfie' : 'full-length photo'}. Upload it again.`, 422);
    }
    const info = readImageInfo(buffer);
    if (!info) throw new AppError('PHOTO_UNREADABLE', `We could not read your ${kind === 'selfie' ? 'selfie' : 'full-length photo'}. Upload it again.`, 422);
    const { contentType, ext } = jpegOrPng(info);
    return { buffer, contentType, fileName: `${kind}.${ext}` };
  }

  async function loadStored(entry) {
    const buffer = await storage.readBuffer(entry.publicId);
    const info = readImageInfo(buffer);
    const { contentType, ext } = jpegOrPng(info ?? { format: 'jpeg' });
    return { buffer, contentType, fileName: `step.${ext}` };
  }

  async function loadItemImage(item) {
    const url = item.imageUrl;
    const own = publicBase && typeof url === 'string' && url.startsWith(`${publicBase}/`);
    let buffer;
    try {
      buffer = own ? await getOwn(url) : (await safeFetcher.fetchImage(url)).buffer;
    } catch (err) {
      log.warn({ err: err.message, itemId: item.id }, 'could not download item photo');
      throw new AppError('ITEM_IMAGE_UNUSABLE', `We could not download the photo for ${item.name}. Try another item.`, 422);
    }
    const info = readImageInfo(buffer);
    if (!info) throw new AppError('ITEM_IMAGE_UNUSABLE', `The photo for ${item.name} is not a JPG or PNG, so YouCam cannot use it. Try another item.`, 422);
    const { contentType, ext } = jpegOrPng(info);
    return { buffer, contentType, fileName: `${item.id}.${ext}` };
  }

  // ---------- job state and events ----------

  const signedUrl = (id) => storage.signedUrl(id);

  function presentJob(job, { active }) {
    return presentLook({ record: job.record, cacheByKey: job.cache, live: active ? job.live : null, active, sampleModel: job.sampleModel, signedUrl });
  }

  function emit(job, event) {
    job.events.push({ at: now(), ...event });
    if (job.events.length > LIMITS.eventsKept) job.events.shift();
    for (const cb of job.listeners) {
      try { cb(event); } catch { /* a broken listener must not stop the render */ }
    }
  }
  const emitLook = (job) => emit(job, { type: 'look', data: presentJob(job, { active: !job.finished }) });
  const emitTrace = (job, data) => emit(job, { type: 'trace', data: { at: now(), ...data } });

  function setLive(job, stage, status) {
    if (status) job.live[stage] = status; else delete job.live[stage];
    emitLook(job);
  }

  // ---------- committing results ----------

  const sessionLost = (job) => { job.aborted = true; };

  async function commitStage(job, stage, { key, entry, cached, units = 0, unitsKnown = true, durationMs = null }) {
    const isFace = FACE_ORDER.includes(stage);
    const at = new Date();
    const stageRecord = { status: 'done', key, cached: Boolean(cached), units: cached ? 0 : units, unitsKnown, durationMs, error: null, at };
    const res = await mutate(job.sessionId, (draft) => {
      const rec = draft.looks.find((l) => l.id === job.lookId);
      if (!rec) return;
      if (!draft.renderCache.some((e) => e.key === key)) draft.renderCache.push(entry);
      rec.stages = { ...(rec.stages ?? {}), [stage]: stageRecord };
      if (isFace) rec.faceChain = [...(rec.faceChain ?? []).filter((c) => c.slot !== stage), { slot: stage, key }];
      rec.updatedAt = at;
      if (!cached) draft.renderRuns += 1;
    });
    if (!res.ok) { sessionLost(job); await deleteAssets([entry.publicId]); return; }
    job.cache.set(key, entry);
    // Retailer counters: units drawn on this catalog, and the first paid stage of a look marks it as drawn.
    if (!cached && units > 0) { metrics?.unitsSpent({ catalogId: job.catalogId }, { units, firstForLook: !job.paidStage }); job.paidStage = true; }
    job.record.stages = { ...(job.record.stages ?? {}), [stage]: stageRecord };
    if (isFace) job.record.faceChain = [...(job.record.faceChain ?? []).filter((c) => c.slot !== stage), { slot: stage, key }];
    delete job.live[stage];
    emitLook(job);
  }

  async function failStage(job, stage, mapped, { attempted = true } = {}) {
    const stageRecord = { status: 'failed', error: mapped, at: new Date() };
    const res = await mutate(job.sessionId, (draft) => {
      const rec = draft.looks.find((l) => l.id === job.lookId);
      if (!rec) return;
      rec.stages = { ...(rec.stages ?? {}), [stage]: stageRecord };
      rec.updatedAt = new Date();
      if (attempted) draft.renderRuns += 1;
    });
    if (!res.ok) sessionLost(job);
    job.record.stages = { ...(job.record.stages ?? {}), [stage]: stageRecord };
    delete job.live[stage];
    emitLook(job);
  }

  // ---------- running one stage ----------

  const isJewellery = (stage) => stage === 'earrings' || stage === 'necklace';
  const wasRejectedAsBadPayload = (err) =>
    (err?.name === 'YoucamError' && err.status === 400 && !/credit/i.test(String(err.code))) ||
    (err?.code === 'TASK_FAILED' && String(err.details?.code).toLowerCase() === 'invalid_parameter');

  /** The jewellery payload is documented two ways; try the configured one, then the others, and remember what worked. */
  async function runTask(job, { stage, item, input, product }) {
    const styles = isJewellery(stage) ? [vtoStyle, ...VTO_STYLES.filter((s) => s !== vtoStyle)] : [null];
    let last;
    for (const style of styles) {
      const req = buildRequest({ stage, item, features, vtoStyle: style ?? vtoStyle, input, product });
      try {
        const result = await gateway.runTask({
          sessionId: job.sessionId, requestId: job.requestId, feature: req.feature, files: req.files, params: req.params,
          storeResult: true, onEvent: (e) => emitTrace(job, { stage, ...e }),
        });
        if (style && style !== vtoStyle) { log.info({ style }, 'jewellery payload style accepted, remembering it'); vtoStyle = style; }
        return result;
      } catch (err) {
        last = err;
        if (!isJewellery(stage) || !wasRejectedAsBadPayload(err) || job.aborted) throw err;
        log.warn({ style, code: err.code }, 'jewellery payload style rejected, trying the next one');
      }
    }
    throw last;
  }

  async function executeStage(job, { stage, root, item, key, loadInput }) {
    setLive(job, stage, 'running');
    const t0 = now();
    try {
      const [input, product] = await Promise.all([loadInput(), stage === 'lipstick' ? null : loadItemImage(item)]);
      if (job.aborted) throw new Aborted();
      const result = await runTask(job, { stage, item, input, product });
      const asset = result.stored?.[0];
      if (!asset?.publicId) throw new AppError('RENDER_FAILED', 'YouCam finished but we could not keep the result.', 502);
      if (job.aborted) { await deleteAssets([asset.publicId]); throw new Aborted(); }
      const entry = {
        key, stage, root, publicId: asset.publicId, width: asset.width, height: asset.height,
        feature: result.feature, taskId: result.taskId, units: result.units, at: new Date(),
      };
      await commitStage(job, stage, { key, entry, cached: false, units: result.units, unitsKnown: result.unitsKnown, durationMs: now() - t0 });
      if (deleteTasks && result.taskId && gateway.deleteTask) {
        // FR-31: finished tasks are removed on YouCam's side too. Best effort: a failure is logged in the ledger.
        Promise.resolve(gateway.deleteTask({ sessionId: job.sessionId, feature: result.feature, taskId: result.taskId })).catch(() => {});
      }
      return { entry };
    } catch (err) {
      if (err?.aborted) { delete job.live[stage]; return { aborted: true }; }
      const mapped = friendlyStageError(stage, err);
      log.warn({ stage, code: err?.code, status: err?.status, detail: err?.details?.code ?? err?.message }, 'render stage failed');
      await failStage(job, stage, mapped);
      return { error: mapped };
    }
  }

  // ---------- the two branches ----------

  async function runBody(job) {
    const item = job.items.outfit;
    const key = stageKey({ feature: features.outfit, stage: 'outfit', item, inputKey: photoKey(job.photos.body, 'body') });
    const hit = job.cache.get(key);
    if (hit) {
      if (job.record.stages?.outfit?.status === 'done' && job.record.stages.outfit.key === key) { delete job.live.outfit; emitLook(job); return; }
      await commitStage(job, 'outfit', { key, entry: hit, cached: true });
      return;
    }
    if (job.aborted) return;
    await executeStage(job, { stage: 'outfit', root: 'body', item, key, loadInput: () => loadPhoto(job, 'body', LIMITS.bodyMaxSide) });
  }

  async function runFace(job) {
    const slots = FACE_ORDER.filter((s) => job.items[s]);
    if (!slots.length) return;
    let cur = { key: photoKey(job.photos.selfie, 'selfie'), entry: null }; // entry null means the selfie itself

    // Results already applied to this look (a retry): build on the last one instead of starting over.
    const done = new Set();
    for (const a of job.record.faceChain ?? []) {
      const entry = job.cache.get(a.key);
      if (job.items[a.slot] && entry) { cur = { key: a.key, entry }; done.add(a.slot); delete job.live[a.slot]; }
    }

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (done.has(slot)) continue;
      if (job.aborted) return;
      const item = job.items[slot];
      const key = stageKey({ feature: features[slot], stage: slot, item, inputKey: cur.key });
      const hit = job.cache.get(key);
      if (hit) {
        await commitStage(job, slot, { key, entry: hit, cached: true });
        cur = { key, entry: hit };
        continue;
      }
      const out = await executeStage(job, {
        stage: slot, root: 'selfie', item, key,
        loadInput: () => (cur.entry ? loadStored(cur.entry) : loadPhoto(job, 'selfie', LIMITS.faceMaxSide)),
      });
      if (out.entry) { cur = { key, entry: out.entry }; continue; }
      if (out.aborted) return;
      // A spending cap applies to every remaining step, so stop and say why on each of them.
      if (CAP_CODES.has(out.error?.code)) {
        for (const rest of slots.slice(i + 1)) if (!done.has(rest) && !job.cache.has(stageKey({ feature: features[rest], stage: rest, item: job.items[rest], inputKey: cur.key }))) await failStage(job, rest, out.error, { attempted: false });
        return;
      }
      // Any other failure: carry on from the last good image. A retry adds only what is missing.
    }
  }

  async function run(job) {
    emitTrace(job, { tool: 'render_look', status: 'running', lookId: job.lookId });
    try {
      await Promise.all([runBody(job), runFace(job)]);
    } catch (err) {
      log.error({ err: err.message, lookId: job.lookId }, 'render job crashed');
      for (const d of STAGES) if (job.live[d.id]) await failStage(job, d.id, friendlyStageError(d.id, err), { attempted: false }).catch(() => {});
    } finally {
      job.finished = true;
      job.live = {};
      jobs.delete(jobKey(job.sessionId, job.lookId));
      if (activeBySession.get(job.sessionId) === job.lookId) activeBySession.delete(job.sessionId);
      emitTrace(job, { tool: 'render_look', status: 'ok', lookId: job.lookId });
      emitLook(job);
      emit(job, { type: 'end' });
      job.listeners.clear();
    }
  }

  // ---------- planning a look from item ids ----------

  async function lookFromInput(session, { itemIds, budgetInr } = {}) {
    if (!Array.isArray(itemIds) || itemIds.length < 1 || itemIds.length > 4 || itemIds.some((x) => typeof x !== 'string' || x.length > 80)) {
      throw new AppError('INVALID_INPUT', 'Send the ids of the items in the look (an outfit, and optionally a necklace, earrings and lipstick).', 400, { field: 'itemIds' });
    }
    if (budgetInr !== undefined && budgetInr !== null && (!Number.isInteger(budgetInr) || budgetInr < BUDGET.min || budgetInr > BUDGET.max)) {
      throw new AppError('INVALID_INPUT', `Choose a budget between ₹${BUDGET.min.toLocaleString('en-IN')} and ₹${BUDGET.max.toLocaleString('en-IN')}.`, 400, { field: 'budgetInr' });
    }
    if (!session.preferences) throw new AppError('PREFERENCES_REQUIRED', 'Add your occasion and budget first, then we can plan your looks.', 409);
    const stored = skin.current(session);
    if (!stored) throw new AppError('NO_PROFILE', 'Read your skin tone first, then we can plan looks to match it.', 409);

    const { items, catalog } = await catalogs.itemsForSession(session);
    const byId = new Map(items.map((i) => [i.id, i]));
    const chosen = {};
    for (const id of new Set(itemIds)) {
      const item = byId.get(id);
      if (!item) throw new AppError('ITEM_NOT_FOUND', 'One of the items in this look is no longer in the catalog. Plan your looks again.', 409, { itemId: id });
      if (!SLOTS.includes(item.type)) throw new AppError('INVALID_INPUT', 'That item cannot be part of a look.', 400, { field: 'itemIds' });
      if (chosen[item.type]) throw new AppError('INVALID_INPUT', 'A look has at most one item of each kind.', 400, { field: 'itemIds' });
      chosen[item.type] = item;
    }
    if (!chosen.outfit) throw new AppError('INVALID_INPUT', 'A look needs an outfit.', 400, { field: 'itemIds' });

    const profile = effectiveProfile(stored);
    const look = rescoreLook({ look: { items: chosen }, profile, prefs: session.preferences, constraints: budgetInr ? { budgetInr } : {} });
    // The budget is a hard limit (FR-17), here too: nobody can draw a look that costs more than it.
    if (!look.withinBudget) {
      const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
      throw new AppError('OVER_BUDGET', `This look costs ${money(look.totalPrice)}, which is ${money(look.overBy)} over your budget of ${money(look.budgetInr)}.`, 409, { overBy: look.overBy });
    }
    return { look, catalogId: catalog?.id ?? null };
  }

  function gate(session) {
    if (!session.consent?.over18) throw new AppError('CONSENT_REQUIRED', 'Confirm the consent screen first.', 403);
    if (!session.photos?.selfie || !session.photos?.body) throw new AppError('PHOTOS_REQUIRED', 'Add your selfie and full-length photo first, or choose a sample model.', 409);
    if (!storage.isConfigured()) throw new AppError('STORAGE_NOT_CONFIGURED', 'Image storage is not set up on the server yet.', 503);
  }

  /** Which stages are already drawn (and so free), assuming each earlier stage succeeds. Mirrors the runner's walk. */
  function predictHits({ session, look, record, cacheByKey }) {
    const items = look.items;
    const hits = {};
    hits.outfit = cacheByKey.has(stageKey({ feature: features.outfit, stage: 'outfit', item: items.outfit, inputKey: photoKey(session.photos.body, 'body') }));
    let cur = photoKey(session.photos.selfie, 'selfie');
    for (const a of record?.faceChain ?? []) if (items[a.slot] && cacheByKey.has(a.key)) { hits[a.slot] = true; cur = a.key; }
    for (const slot of FACE_ORDER) {
      const item = items[slot];
      if (!item || hits[slot]) continue;
      const key = stageKey({ feature: features[slot], stage: slot, item, inputKey: cur });
      hits[slot] = cacheByKey.has(key);
      cur = key;
    }
    return hits;
  }

  async function unitsOf(slot) {
    try {
      if (gateway.unitsFor) {
        const u = await gateway.unitsFor(features[slot]);
        return { units: u.units, known: u.known };
      }
    } catch { /* fall through to the documented price */ }
    return { units: DOCUMENTED_UNITS[slot], known: false };
  }

  async function assertCapacity(session, toRun) {
    const sid = session._id;
    let needed = 0;
    for (const slot of toRun) needed += (await unitsOf(slot)).units;
    if ((session.renderRuns ?? 0) + toRun.length > renderCap) {
      throw new AppError('RENDER_CAP', 'This session has drawn as many looks as it can. Looks already drawn stay available.', 429, { cap: renderCap });
    }
    if (!ledger || !needed) return needed;
    const [used, today] = await Promise.all([ledger.sessionUnits(sid), ledger.dailyUnits()]);
    if (config.sessionUnitCap && used + needed > config.sessionUnitCap) {
      throw new AppError('SESSION_CAP', `This look needs about ${needed} units and this session has ${Math.max(0, config.sessionUnitCap - used)} left. Looks already drawn stay available.`, 429, { needed, used, cap: config.sessionUnitCap });
    }
    if (config.globalDailyUnitCap && today + needed > config.globalDailyUnitCap) {
      throw new AppError('GLOBAL_CAP', 'The daily unit allowance for this demo has been reached. Looks already drawn stay available. Try again tomorrow.', 429, { today });
    }
    return needed;
  }

  // ---------- public API ----------

  const recordOf = (session, lookId) => (session.looks ?? []).find((l) => l.id === lookId) ?? null;

  function present(session, record) {
    const job = jobs.get(jobKey(session._id, record.id));
    const active = Boolean(job && !job.finished);
    if (active) return presentJob(job, { active: true });
    return presentLook({
      record, cacheByKey: cacheMap(session), live: null, active: false,
      sampleModel: session.photos?.selfie?.source === 'sample', signedUrl,
    });
  }

  async function start(session, input) {
    const sid = session._id;
    return withLock(`start:${sid}`, async () => {
      gate(session);
      const { look, catalogId } = await lookFromInput(session, input);
      const lookId = look.id;

      const running = jobs.get(jobKey(sid, lookId));
      if (running && !running.finished) return presentJob(running, { active: true }); // idempotent: joins the running job
      if (activeBySession.has(sid)) throw new AppError('RENDER_BUSY', 'Another look is still being drawn. Wait for it to finish, then try this one.', 409, { lookId: activeBySession.get(sid) });

      const snapshot = snapshotOf(look);
      let evicted = [];
      const saved = await mutate(sid, (draft) => {
        const at = new Date();
        const existing = draft.looks.find((l) => l.id === lookId);
        if (existing) { existing.snapshot = snapshot; existing.updatedAt = at; } else {
          draft.looks.push({ id: lookId, createdAt: at, updatedAt: at, snapshot, stages: {}, faceChain: [] });
        }
        // Keep six looks (FR-25). The oldest goes first, along with any drawing nothing else uses.
        while (draft.looks.length > LIMITS.maxLooksPerSession) {
          const idx = draft.looks.map((l, i) => ({ l, i })).filter(({ l }) => l.id !== lookId && !activeBySession.has(sid)).sort((a, b) => new Date(a.l.updatedAt) - new Date(b.l.updatedAt))[0]?.i;
          if (idx === undefined) break;
          draft.looks.splice(idx, 1);
        }
        evicted = collectGarbage(draft);
      });
      if (!saved.ok) throw sessionGone();
      await deleteAssets(evicted);
      const fresh = await sessions.get(sid);
      if (!fresh) throw sessionGone();
      const record = recordOf(fresh, lookId);
      const cacheByKey = cacheMap(fresh);
      const hits = predictHits({ session: fresh, look, record, cacheByKey });
      const toRun = Object.entries(hits).filter(([, hit]) => !hit).map(([slot]) => slot);
      if (toRun.length) await assertCapacity(fresh, toRun);

      // Retailer counters (FR-29): a look counts once, when it is really going to be drawn. One refused by a cap does not count,
      // and a retry of the same look does not count twice (the record carries a flag).
      if (!record.counted) {
        const marked = await mutate(sid, (draft) => { const r = draft.looks.find((l) => l.id === lookId); if (r) r.counted = true; });
        if (marked.ok) { record.counted = true; metrics?.lookStarted({ catalogId }, look.items); }
      }

      const job = {
        sessionId: sid, lookId, requestId: input?.requestId ?? null, items: look.items, photos: { selfie: fresh.photos.selfie, body: fresh.photos.body },
        sampleModel: fresh.photos.selfie.source === 'sample', catalogId, paidStage: false,
        record: structuredClone(record), cache: cacheByKey, live: {}, listeners: new Set(), events: [], aborted: false, finished: false, startedAt: now(),
      };
      for (const d of STAGES) {
        if (!look.items[d.slot]) continue;
        const savedDone = record.stages?.[d.id]?.status === 'done' && cacheByKey.has(record.stages[d.id].key);
        if (!savedDone) job.live[d.id] = 'queued';
      }
      jobs.set(jobKey(sid, lookId), job);
      activeBySession.set(sid, lookId);
      run(job).catch((err) => log.error({ err: err.message }, 'render job failed to finish'));
      return presentJob(job, { active: true });
    });
  }

  /** Retry or resume a look already in the session, using the items it was planned with. */
  async function startFromId(session, lookId, { requestId } = {}) {
    if (!LOOK_ID.test(lookId)) throw lookGone();
    const record = recordOf(session, lookId);
    if (!record) throw lookGone();
    return start(session, { itemIds: Object.values(record.snapshot.items).map((i) => i.id), budgetInr: record.snapshot.budgetInr, requestId });
  }

  async function get(session, lookId) {
    if (!LOOK_ID.test(lookId)) throw lookGone();
    const record = recordOf(session, lookId);
    if (!record) throw lookGone();
    return present(session, record);
  }

  async function list(session) {
    return [...(session.looks ?? [])]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .map((r) => present(session, r));
  }

  /** For the SSE route: the current state, plus a way to hear about changes while the look is being drawn. */
  function watch(session, lookId, cb) {
    const job = jobs.get(jobKey(session._id, lookId));
    if (job && !job.finished) {
      job.listeners.add(cb);
      return { initial: presentJob(job, { active: true }), unsubscribe: () => job.listeners.delete(cb), live: true };
    }
    const record = recordOf(session, lookId);
    if (!record) throw lookGone();
    return { initial: present(session, record), unsubscribe: () => {}, live: false };
  }

  async function remove(session, lookId) {
    if (!LOOK_ID.test(lookId)) throw lookGone();
    const sid = session._id;
    if (activeBySession.get(sid) === lookId) throw new AppError('RENDER_BUSY', 'This look is still being drawn. Wait for it to finish.', 409);
    let orphans = [];
    const res = await mutate(sid, (draft) => {
      const idx = draft.looks.findIndex((l) => l.id === lookId);
      if (idx < 0) throw lookGone();
      draft.looks.splice(idx, 1);
      orphans = collectGarbage(draft);
    });
    if (!res.ok) throw sessionGone();
    await deleteAssets(orphans);
    return { deleted: true };
  }

  /** A photo was replaced, removed or swapped for a sample: drawings made from it must go (FR-31). Safe to call anytime. */
  async function dropForPhotos(sessionId, kinds) {
    const roots = new Set(kinds);
    const lookId = activeBySession.get(sessionId);
    const job = lookId ? jobs.get(jobKey(sessionId, lookId)) : null;
    if (job) job.aborted = true;
    let removed = [];
    const res = await mutate(sessionId, (draft) => {
      const gone = draft.renderCache.filter((e) => roots.has(e.root));
      const goneKeys = new Set(gone.map((e) => e.key));
      removed = gone.map((e) => e.publicId).filter(Boolean);
      draft.renderCache = draft.renderCache.filter((e) => !goneKeys.has(e.key));
      for (const l of draft.looks) {
        for (const d of STAGES) {
          const st = l.stages?.[d.id];
          const fromGoneRoot = (d.panel === 'body' && roots.has('body')) || (d.panel === 'face' && roots.has('selfie'));
          if (st && (fromGoneRoot || (st.key && goneKeys.has(st.key)))) l.stages[d.id] = { status: 'idle' };
        }
        l.faceChain = (l.faceChain ?? []).filter((c) => !goneKeys.has(c.key));
      }
    });
    if (res.ok) await deleteAssets(removed);
  }

  /** The session is being deleted: stop any running job. Stored images go with the session's storage tag. */
  function abortSession(sessionId) {
    const lookId = activeBySession.get(sessionId);
    const job = lookId ? jobs.get(jobKey(sessionId, lookId)) : null;
    if (job) job.aborted = true;
  }

  // ---------- sharing (FR-21) ----------

  async function createShare(session, lookId) {
    const presented = await get(session, lookId);
    if (!presented.images.body && !presented.images.face) throw new AppError('NOTHING_TO_SHARE', 'Draw this look first, then share it.', 409);
    const ttlMs = (config.shareTtlHours ?? LIMITS.shareTtlHours) * 3_600_000;
    const expiresAt = Math.min(now() + ttlMs, new Date(session.expiresAt).getTime());
    const token = tokens.sign({ sessionId: session._id, lookId, expiresAt });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  async function loadShared(token) {
    const p = tokens.verify(token);
    if (!p) throw shareGone();
    const session = await sessions.get(p.sessionId);
    const record = session ? recordOf(session, p.lookId) : null;
    if (!record) throw shareGone();
    return { p, record, presented: present(session, record) };
  }

  async function openShare(token) {
    const { p, record, presented } = await loadShared(token);
    return presentShared({ record, expiresAt: p.expiresAt, present: presented });
  }

  /** The signed storage URL for one panel of a shared look. The route streams it, so the browser never sees the storage address. */
  async function shareImage(token, panel) {
    if (panel !== 'body' && panel !== 'face') throw new AppError('NOT_FOUND', 'Choose the body or face image.', 404);
    const { presented } = await loadShared(token);
    const img = presented.images[panel];
    if (!img) throw new AppError('NOT_FOUND', 'That image has not been drawn.', 404);
    return { url: img.url };
  }

  async function publicConfig() {
    const stages = [];
    for (const d of STAGES) {
      const u = await unitsOf(d.slot);
      stages.push({ id: d.id, label: d.label, panel: d.panel, units: u.units, unitsKnown: u.known });
    }
    return publicRenderConfig({ stages });
  }

  return { start, startFromId, get, list, watch, remove, dropForPhotos, abortSession, createShare, openShare, shareImage, publicConfig };
}
