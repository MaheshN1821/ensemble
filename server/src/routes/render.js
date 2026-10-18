import { Router } from 'express';
import { Readable } from 'node:stream';
import { AppError, asyncHandler } from '../lib/errors.js';
import { LIMITS } from '../config/render.js';
import { requireSession } from '../middleware/session.js';

const sse = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/**
 * Render routes (Stage 6). Starting a look spends YouCam units, so it only ever draws what is not already cached.
 * Progress is a Server-Sent Events stream (FR-19); GET on the look returns the same snapshot for clients that poll.
 */
export function renderRoutes({ sessions, renders }) {
  const router = Router();
  const auth = requireSession(sessions);

  router.get('/api/render/config', asyncHandler(async (_req, res) => res.json(await renders.publicConfig())));

  // Choose a look: records it and starts drawing whatever is not cached. Returns at once; follow progress on /events.
  router.post('/api/sessions/me/looks', auth, asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const look = await renders.start(req.session, { itemIds: body.itemIds, budgetInr: body.budgetInr, requestId: req.id });
    res.status(202).json({ look });
  }));

  router.get('/api/sessions/me/looks', auth, asyncHandler(async (req, res) => res.json({ looks: await renders.list(req.session), max: LIMITS.maxLooksPerSession })));

  router.get('/api/sessions/me/looks/:lookId', auth, asyncHandler(async (req, res) => res.json({ look: await renders.get(req.session, req.params.lookId) })));

  // Retry or resume: draws only the stages that are missing, so nothing is charged twice.
  router.post('/api/sessions/me/looks/:lookId/render', auth, asyncHandler(async (req, res) => {
    res.status(202).json({ look: await renders.startFromId(req.session, req.params.lookId, { requestId: req.id }) });
  }));

  router.delete('/api/sessions/me/looks/:lookId', auth, asyncHandler(async (req, res) => res.json(await renders.remove(req.session, req.params.lookId))));

  router.post('/api/sessions/me/looks/:lookId/share', auth, asyncHandler(async (req, res) => res.status(201).json(await renders.createShare(req.session, req.params.lookId))));

  router.get('/api/sessions/me/looks/:lookId/events', auth, (req, res, next) => {
    let sub;
    try {
      sub = renders.watch(req.session, req.params.lookId, (event) => {
        if (event.type === 'end') { clearInterval(beat); res.end(); return; }
        sse(res, event.type, event.data);
      });
    } catch (err) { return next(err); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    sse(res, 'look', sub.initial);
    const beat = setInterval(() => res.write(': keep-alive\n\n'), LIMITS.eventKeepAliveMs);
    req.on('close', () => { clearInterval(beat); sub.unsubscribe(); });
    if (!sub.live) { clearInterval(beat); res.end(); }
  });

  // Public, read-only, and expiring. Photos are streamed through here so the expiry is enforced on every request.
  router.get('/api/share/:token', asyncHandler(async (req, res) => res.json({ look: await renders.openShare(req.params.token) })));

  router.get('/api/share/:token/image/:panel', asyncHandler(async (req, res) => {
    const { url } = await renders.shareImage(req.params.token, req.params.panel);
    const upstream = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!upstream.ok || !upstream.body) throw new AppError('NOT_FOUND', 'That image is no longer available.', 404);
    res.set({ 'Content-Type': upstream.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'private, max-age=300', 'Cross-Origin-Resource-Policy': 'cross-origin' });
    Readable.fromWeb(upstream.body).pipe(res);
  }));

  return router;
}
