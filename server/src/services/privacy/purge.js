import { shortId } from '../../lib/logIds.js';

/**
 * Data deletion (FR-31, FR-32, FR-33).
 *
 * `purge(session)` removes everything a session left outside the database: uploaded photos and drawn results in
 * storage (one call by session tag) and the finished tasks on YouCam's side. The database document itself is removed
 * by the caller after a successful purge, so a storage failure leaves the session in place and the next attempt retries.
 *
 * `sweepExpired()` does this for every session past its expiry. It replaces the Mongo TTL index, which would have
 * deleted the document (and with it the only record of which stored images to remove) before the images were gone.
 */
export function createPurger({ sessions, storage, gateway, ledger, renders, agent, logger, deleteTasks = true, batchSize = 25, maxBatches = 8, maxTasksPerSession = 12, now = Date.now }) {
  const parts = { renders, agent }; // the app attaches these once it has built them (see attach)
  const log = logger ?? { info() {}, warn() {}, error() {} };
  const status = { lastRunAt: null, lastRunMs: null, lastSwept: 0, lastFailed: 0, totalSwept: 0, totalFailed: 0, running: false, lastError: null };
  let timer = null;

  /** Asks YouCam to delete the finished tasks of a session that were not already deleted. Never throws. */
  async function deleteYoucamTasks(session) {
    if (!deleteTasks || !gateway?.deleteTask) return { attempted: 0, deleted: 0 };
    const entries = (session.renderCache ?? []).filter((e) => e.taskId && e.feature);
    if (!entries.length) return { attempted: 0, deleted: 0 };
    let done = new Set();
    try { done = (await ledger?.deletedTaskIds?.(session._id)) ?? new Set(); } catch { /* retry them all */ }
    const todo = entries.filter((e) => !done.has(e.taskId)).slice(0, maxTasksPerSession);
    let deleted = 0;
    for (const e of todo) {
      try { if (await gateway.deleteTask({ sessionId: session._id, feature: e.feature, taskId: e.taskId })) deleted++; } catch { /* the gateway logs it */ }
    }
    return { attempted: todo.length, deleted };
  }

  return {
    /**
     * Deletes a session's stored files and its YouCam tasks. Throws if storage cannot be cleared (nothing is lost, retry later).
     * `tasks`: 'wait' finishes the YouCam deletions before returning; 'background' returns as soon as storage is clear.
     */
    async purge(session, { tasks = 'wait' } = {}) {
      const sid = session._id;
      parts.renders?.abortSession?.(sid); // a look still being drawn stops; its results go with the storage tag below
      const { deleted: files } = await storage.deleteSession(sid);
      parts.agent?.forget?.(sid);
      const taskWork = deleteYoucamTasks(session);
      if (tasks === 'wait') {
        const t = await taskWork;
        return { files, tasks: t };
      }
      taskWork.catch(() => {});
      return { files, tasks: null };
    },

    /** One pass over expired sessions. Overlapping calls are ignored. */
    async sweepExpired() {
      if (status.running) return { skipped: true };
      status.running = true;
      const t0 = now();
      let swept = 0;
      let failed = 0;
      try {
        for (let b = 0; b < maxBatches; b++) {
          const expired = await sessions.listExpired(batchSize);
          if (!expired.length) break;
          let progressed = 0;
          for (const s of expired) {
            try {
              const out = await this.purge(s, { tasks: 'wait' });
              await sessions.remove(s._id);
              swept++; progressed++;
              log.info({ sid: shortId(s._id), files: out.files, tasks: out.tasks }, 'expired session deleted');
            } catch (err) {
              failed++;
              status.lastError = err?.message ?? 'unknown error';
              log.error({ err: err?.message, sid: shortId(s._id) }, 'expired session could not be deleted; will retry');
            }
          }
          if (!progressed || expired.length < batchSize) break; // nothing moved: do not spin on the same failing sessions
        }
      } catch (err) {
        status.lastError = err?.message ?? 'unknown error';
        log.error({ err: err?.message }, 'session sweep failed');
      } finally {
        status.running = false;
        status.lastRunAt = new Date(now()).toISOString();
        status.lastRunMs = now() - t0;
        status.lastSwept = swept;
        status.lastFailed = failed;
        status.totalSwept += swept;
        status.totalFailed += failed;
      }
      return { swept, failed };
    },

    /** Runs once now, then every `intervalMs`. The timer never keeps the process alive. */
    start({ intervalMs = 300_000 } = {}) {
      const run = () => this.sweepExpired().catch((err) => log.error({ err: err?.message }, 'session sweep crashed'));
      run();
      timer = setInterval(run, intervalMs);
      timer.unref?.();
    },
    /** The render and agent services are built after the purger in index.js; the app hands them over here. */
    attach(extra) { Object.assign(parts, extra); },
    stop() { if (timer) clearInterval(timer); timer = null; },
    status: () => ({ ...status }),
  };
}
