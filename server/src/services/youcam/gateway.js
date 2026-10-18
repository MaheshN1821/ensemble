import { AppError } from '../../lib/errors.js';
import { sleep as defaultSleep, withRetry } from '../../lib/retry.js';
import { findUnits, parseTask } from './parse.js';
import { setPath } from '../../lib/objectPath.js';

const COST_TTL_MS = 10 * 60 * 1000;
const noop = () => {};

/**
 * The only place the rest of the app talks to YouCam through.
 * Every outbound API call is queued behind the token buckets, retried when safe, and every task is
 * written to the unit ledger. Task creation is NOT retried on timeouts: YouCam offers no idempotency
 * key, so a blind retry could double-charge. It is retried on 429 only, where nothing was created.
 */
export function createGateway({ client, queue, ledger, storage, config, logger, sleep = defaultSleep, now = Date.now }) {
  let costCache = { at: 0, data: null };
  let costInflight = null;

  const api = (label, fn, { priority = 0, shouldRetry } = {}) =>
    withRetry(() => queue.schedule(fn, { label, priority }), {
      shouldRetry: shouldRetry ?? ((e) => e.retryable),
      sleep,
      onRetry: (err, attempt, wait) => {
        if (err.status === 429) queue.penalize(wait);
        logger.warn({ label, attempt, status: err.status, waitMs: Math.round(wait) }, 'youcam retry');
      },
    });

  async function featureCost({ sessionId = 'system', force = false } = {}) {
    if (!force && costCache.data && now() - costCache.at < COST_TTL_MS) {
      return { data: costCache.data, cached: true, fetchedAt: costCache.at };
    }
    if (costInflight) return costInflight;

    costInflight = (async () => {
      const started = now();
      try {
        const data = await api('feature-cost', () => client.getFeatureCost());
        costCache = { at: now(), data };
        await ledger.record({ sessionId, kind: 'feature-cost', units: 0, success: true, durationMs: now() - started });
        return { data, cached: false, fetchedAt: costCache.at };
      } catch (err) {
        await ledger.record({
          sessionId,
          kind: 'feature-cost',
          units: 0,
          success: false,
          durationMs: now() - started,
          errorCode: err.code ?? 'ERROR',
        });
        throw err;
      } finally {
        costInflight = null;
      }
    })();
    return costInflight;
  }

  async function unitsFor(feature) {
    const override = config.unitOverrides?.[feature];
    if (typeof override === 'number') return { units: override, known: true };
    try {
      const { data } = await featureCost({ sessionId: 'system' });
      const units = findUnits(data, feature);
      if (units !== null) return { units, known: true };
    } catch (err) {
      logger.warn({ feature, err: err.message }, 'could not resolve unit price');
    }
    // Prices printed in the YouCam docs beat a blind guess. Still flagged as not confirmed (known: false).
    const documented = config.documentedUnits?.[feature];
    if (typeof documented === 'number') return { units: documented, known: false };
    return { units: config.unknownFeatureUnits, known: false };
  }

  async function assertBudget(sessionId, units) {
    const [used, today] = await Promise.all([ledger.sessionUnits(sessionId), ledger.dailyUnits()]);
    if (used + units > config.sessionUnitCap) {
      throw new AppError('SESSION_CAP', 'This session has used its unit allowance.', 429, { used, cap: config.sessionUnitCap });
    }
    if (today + units > config.globalDailyUnitCap) {
      throw new AppError('GLOBAL_CAP', 'The daily unit allowance for this demo has been reached.', 429, { today });
    }
  }

  async function uploadImage({ buffer, fileName, contentType }) {
    const record = await api('file-record', () => client.createFileRecord({ fileName, contentType, fileSize: buffer.length }));
    const request = record?.requests?.[0];
    if (!record?.file_id || !request?.url) {
      throw new AppError('YOUCAM_BAD_RESPONSE', 'YouCam did not return an upload URL.', 502);
    }
    await withRetry(() => client.putFile(request, buffer), { sleep });
    return record.file_id;
  }

  /**
   * Upload inputs, create the task, poll to completion, optionally copy result images to our storage.
   * `files` entries: { field, buffer, fileName, contentType } or { field, fileId } (to chain a previous result).
   * One upload may fill several payload fields: { fields: ['src_file_id', 'source_info.name'] }. A field can be a dotted
   * path, and { path, array: true } (or `asArray: true` with `field`) wraps the id in an array, as the jewellery tasks need.
   */
  async function runTask({ sessionId, requestId = null, feature, files = [], params = {}, storeResult = false, onEvent = noop }) {
    const started = now();
    const { units: estimate, known } = await unitsFor(feature);
    await assertBudget(sessionId, estimate);

    const step = async (tool, fn) => {
      const t0 = now();
      onEvent({ type: 'step', tool, status: 'running' });
      try {
        const out = await fn();
        onEvent({ type: 'step', tool, status: 'ok', durationMs: now() - t0 });
        return out;
      } catch (err) {
        onEvent({ type: 'step', tool, status: 'error', durationMs: now() - t0, code: err.code });
        throw err;
      }
    };

    let taskId = null;
    let charged = 0;
    try {
      const payload = { ...params };
      for (const f of files) {
        const id = f.fileId ?? (await step('upload_file', () => uploadImage(f)));
        const targets = f.fields ?? [{ path: f.field, array: Boolean(f.asArray) }];
        for (const t of targets) {
          const spec = typeof t === 'string' ? { path: t, array: false } : t;
          setPath(payload, spec.path, spec.array ? [id] : id);
        }
      }

      const created = await step('create_task', () =>
        api(`task:${feature}`, () => client.createTask(feature, payload), { shouldRetry: (e) => e.status === 429 }),
      );
      taskId = created?.task_id;
      if (!taskId) throw new AppError('YOUCAM_BAD_RESPONSE', 'YouCam did not return a task id.', 502);

      const parsed = await step('poll_task', async () => {
        const deadline = now() + config.taskTimeoutMs;
        let interval = config.pollIntervalMs;
        for (;;) {
          await sleep(interval);
          const data = await api(`poll:${feature}`, () => client.getTask(feature, taskId), { priority: 1 });
          const t = parseTask(data);
          if (t.status === 'success') return t;
          if (t.status === 'error') {
            throw new AppError('TASK_FAILED', 'YouCam could not process this image.', 422, { code: t.errorCode });
          }
          if (now() > deadline) throw new AppError('TASK_TIMEOUT', 'The task took too long to finish.', 504);
          interval = t.pollingIntervalMs ?? interval;
        }
      });

      let stored = [];
      if (storeResult && parsed.resultUrls.length) {
        if (!storage?.isConfigured()) {
          throw new AppError('STORAGE_NOT_CONFIGURED', 'Image storage is not configured.', 503);
        }
        stored = await step('store_result', () =>
          Promise.all(parsed.resultUrls.map((url) => storage.saveFromUrl({ sessionId, url, kind: feature }))),
        );
      }

      charged = estimate;
      await ledger.record({
        sessionId, kind: 'task', feature, taskId, units: charged, unitsKnown: known,
        success: true, durationMs: now() - started, requestId,
      });
      return { taskId, feature, units: charged, unitsKnown: known, results: parsed.results, resultUrls: parsed.resultUrls, stored, durationMs: now() - started };
    } catch (err) {
      await ledger.record({
        sessionId, kind: 'task', feature, taskId, units: 0, unitsKnown: known,
        success: false, durationMs: now() - started, errorCode: err.code ?? 'ERROR', requestId,
      });
      throw err;
    }
  }

  async function deleteTask({ sessionId, feature, taskId }) {
    const started = now();
    try {
      await api('task-delete', () => client.deleteTask(feature, taskId));
      await ledger.record({ sessionId, kind: 'task-delete', feature, taskId, units: 0, success: true, durationMs: now() - started });
      return true;
    } catch (err) {
      logger.warn({ feature, taskId, err: err.message }, 'task delete failed');
      await ledger.record({ sessionId, kind: 'task-delete', feature, taskId, units: 0, success: false, durationMs: now() - started, errorCode: err.code ?? 'ERROR' });
      return false;
    }
  }

  return { featureCost, unitsFor, runTask, deleteTask };
}
