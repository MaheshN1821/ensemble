// Per-IP request limits (Stage 9, NFR security). The global limit covers everything; these cover the actions that
// cost something: photo uploads (storage), skin analysis and looks (YouCam units), refinements (language model).
// A value of 0 turns that limit off. Unit and render caps (per session and per day) live in the gateway and render service.
export const DEFAULT_LIMITS = {
  requestsPerMinute: 120,   // every /api request, per IP
  sessionsPerHour: 30,      // new anonymous sessions
  uploadsPerHour: 40,       // photo uploads
  skinPerHour: 12,          // skin-tone readings (each can spend units)
  rendersPerHour: 24,       // looks started or retried (each can spend units)
  agentTurnsPerHour: 60,    // typed or chip refinements
  shareViewsPerMinute: 90,  // public share-link views
  statsPerMinute: 30,       // retailer view and CSV export
  loginsPer15Min: 20,       // sign-in attempts, per IP (a per-account throttle sits on top, in the auth service)
  registrationsPerHour: 10, // new accounts, per IP
};

export function resolveLimits(partial = {}) {
  const out = { ...DEFAULT_LIMITS };
  for (const k of Object.keys(DEFAULT_LIMITS)) {
    const v = partial?.[k];
    if (Number.isFinite(v) && v >= 0) out[k] = Math.floor(v);
  }
  return out;
}
