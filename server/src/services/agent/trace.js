import { LIMITS } from '../../config/agent.js';

/**
 * The live record of what the agent did (FR-26): one entry per step with the tool name, an input summary, the duration,
 * the units spent and the outcome. Real data only: entries are written by the code that does the work.
 * Memory only and per session. It holds step names and item names, never images or skin data, and goes when the session
 * is deleted, after 24 hours, or when the server restarts.
 */
export function createTraceStore({ now = Date.now, maxPerSession = LIMITS.traceKept, ttlMs = LIMITS.traceTtlMs, maxSessions = LIMITS.traceSessionsKept } = {}) {
  const sessions = new Map(); // sessionId -> { entries[], listeners:Set, touched, seq }

  const slot = (sid) => {
    let s = sessions.get(sid);
    if (!s) {
      if (sessions.size >= maxSessions) {
        const oldest = [...sessions.entries()].sort((a, b) => a[1].touched - b[1].touched)[0];
        if (oldest) sessions.delete(oldest[0]);
      }
      s = { entries: [], listeners: new Set(), touched: now(), seq: 0 };
      sessions.set(sid, s);
    }
    s.touched = now();
    return s;
  };
  const push = (s, entry) => {
    for (const cb of s.listeners) { try { cb(entry); } catch { /* a broken listener must not stop the work */ } }
  };

  return {
    /** Starts a step. Returns its id so it can be finished later. */
    begin(sid, { turnId = null, tool, input = '', status = 'running' }) {
      const s = slot(sid);
      const entry = { id: `s${++s.seq}`, turnId, tool, input: String(input).slice(0, 160), status, startedAt: new Date(now()).toISOString(), durationMs: null, units: 0, cached: false, outcome: null };
      s.entries.push(entry);
      if (s.entries.length > maxPerSession) s.entries.shift();
      push(s, { ...entry });
      return entry.id;
    },
    /** Completes a step with its outcome. Unknown ids are ignored (the entry may have scrolled out). */
    finish(sid, id, patch) {
      const s = sessions.get(sid);
      const entry = s?.entries.find((e) => e.id === id);
      if (!entry) return;
      Object.assign(entry, patch);
      if (patch.durationMs === undefined && entry.durationMs === null) entry.durationMs = Math.max(0, now() - Date.parse(entry.startedAt));
      s.touched = now();
      push(s, { ...entry });
    },
    /** Changes a step that is still going (queued to running) without ending it. */
    update(sid, id, patch) {
      const s = sessions.get(sid);
      const entry = s?.entries.find((e) => e.id === id);
      if (!entry) return;
      Object.assign(entry, patch);
      push(s, { ...entry });
    },
    /** A step that is already over (a lookup, a decision). */
    add(sid, { turnId = null, tool, input = '', status = 'ok', outcome = null, durationMs = 0, units = 0, cached = false }) {
      const id = this.begin(sid, { turnId, tool, input, status });
      this.finish(sid, id, { status, outcome, durationMs, units, cached });
      return id;
    },
    list(sid) { return (sessions.get(sid)?.entries ?? []).map((e) => ({ ...e })); },
    /** Listens for new and updated entries. Returns an unsubscribe function. */
    subscribe(sid, cb) {
      const s = slot(sid);
      s.listeners.add(cb);
      return () => s.listeners.delete(cb);
    },
    clear(sid) {
      const s = sessions.get(sid);
      if (!s) return;
      s.entries = [];
      for (const cb of s.listeners) { try { cb({ cleared: true }); } catch { /* ignore */ } }
      sessions.delete(sid);
    },
    sweep() {
      const cutoff = now() - ttlMs;
      for (const [sid, s] of sessions) if (s.touched < cutoff && !s.listeners.size) sessions.delete(sid);
    },
    size: () => sessions.size,
  };
}
