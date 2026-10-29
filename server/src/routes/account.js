import { Router } from 'express';
import { asyncHandler } from '../lib/errors.js';
import { requireAccount } from '../middleware/auth.js';

/** A shopper's saved space: what the account keeps for them, in one response. Photos are never sent here, only that they exist. */
export function accountRoutes({ auth, sessions, skin, config }) {
  const router = Router();
  const shopper = requireAccount(auth, 'shopper');

  router.get('/api/account/overview', shopper, asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const session = await sessions.findByAccount(req.account._id);
    const base = { account: auth.present(req.account), keptUntil: session?.expiresAt ?? null };
    if (!session) return res.json({ ...base, photos: { selfie: null, body: null }, preferences: null, skin: null, skinHistory: [], looks: { count: 0, latest: [] } });

    const asset = (a) => (a ? { source: a.source, sampleId: a.sampleId ?? undefined, addedAt: a.addedAt ?? null } : null);
    const stored = skin.current(session);
    const looks = [...(session.looks ?? [])].sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0) - new Date(a.updatedAt ?? a.createdAt ?? 0));
    res.json({
      ...base,
      consentedAt: session.consent?.acceptedAt ?? null,
      photos: { selfie: asset(session.photos?.selfie), body: asset(session.photos?.body) },
      preferences: session.preferences ?? null,
      skin: stored ? skin.present(stored, session) : null,
      skinHistory: [...(session.skinHistory ?? [])].reverse(),
      looks: {
        count: looks.length,
        latest: looks.slice(0, 4).map((l) => ({ id: l.id, createdAt: l.createdAt ?? null, outfit: l.snapshot?.items?.outfit?.name ?? null, totalPrice: l.snapshot?.totalPrice ?? null })),
      },
      caps: { units: config.sessionUnitCap },
    });
  }));

  return router;
}
