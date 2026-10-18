import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { LIMITS } from '../config/render.js';
import { requireSession } from '../middleware/session.js';

const sse = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/**
 * Agent routes (Stage 7). A turn changes a look through the planner and starts drawing only what changed; the trace and the
 * governor show what that cost. The trace stream uses Server-Sent Events read with fetch (the session header rules out EventSource).
 */
export function agentRoutes({ sessions, agent }) {
  const router = Router();
  const auth = requireSession(sessions);

  router.get('/api/agent/config', asyncHandler(async (_req, res) => res.json(await agent.publicConfig())));

  router.post('/api/sessions/me/agent/turn', auth, asyncHandler(async (req, res) => {
    res.json(await agent.turn(req.session, req.body, { requestId: req.id }));
  }));

  router.get('/api/sessions/me/governor', auth, asyncHandler(async (req, res) => res.json(await agent.governor(req.session))));

  router.get('/api/sessions/me/agent/trace', auth, (req, res) => res.json({ entries: agent.trace.list(req.session._id) }));

  router.get('/api/sessions/me/agent/trace/events', auth, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    sse(res, 'snapshot', { entries: agent.trace.list(req.session._id) });
    const off = agent.trace.subscribe(req.session._id, (entry) => (entry.cleared ? sse(res, 'cleared', {}) : sse(res, 'step', entry)));
    const beat = setInterval(() => res.write(': keep-alive\n\n'), LIMITS.eventKeepAliveMs);
    req.on('close', () => { clearInterval(beat); off(); });
  });

  return router;
}
