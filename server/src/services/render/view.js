import { AI_LABEL, STAGES } from '../../config/render.js';

/** What we keep about a look: names, prices and links as planned, never an image. */
export function snapshotOf(look) {
  const items = {};
  for (const [slot, i] of Object.entries(look.items)) {
    if (!i) continue;
    items[slot] = {
      id: i.id, type: i.type, name: i.name, price: i.price, imageUrl: i.imageUrl, productUrl: i.productUrl ?? null,
      metalTone: i.metalTone ?? null, garmentCategory: i.garmentCategory ?? null, source: i.source ?? 'merchant',
      colours: (i.colours ?? []).slice(0, 1),
    };
  }
  return {
    id: look.id, items, totalPrice: look.totalPrice, budgetInr: look.budgetInr, score: look.score,
    summary: look.summary ?? '', reasons: look.reasons ?? [], cautions: look.cautions ?? [],
  };
}

const join = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/**
 * The look as the client sees it. Pure: given the stored record, the cache entries and (optionally) the live job.
 * Statuses: idle | queued | running | done | failed. `cached` means the result was reused and cost no units.
 */
export function presentLook({ record, cacheByKey, live = null, active = false, sampleModel = false, signedUrl }) {
  const snap = record.snapshot;
  const stages = STAGES.filter((d) => snap.items[d.slot]).map((d) => {
    const saved = record.stages?.[d.id] ?? {};
    const transient = live?.[d.id];
    const status = transient ?? (saved.status === 'done' ? 'done' : saved.status === 'failed' ? 'failed' : 'idle');
    return {
      id: d.id, panel: d.panel, label: d.label, doing: d.doing,
      item: { id: snap.items[d.slot].id, name: snap.items[d.slot].name },
      status,
      cached: status === 'done' && Boolean(saved.cached),
      units: status === 'done' ? (saved.cached ? 0 : saved.units ?? 0) : 0,
      unitsKnown: saved.unitsKnown ?? true,
      durationMs: status === 'done' && !saved.cached ? saved.durationMs ?? null : null,
      error: status === 'failed' ? saved.error ?? { code: 'RENDER_FAILED', message: 'This step did not finish. Try again.', retryable: true } : null,
    };
  });

  const image = (entry, alt) => (entry ? { url: signedUrl(entry.publicId), width: entry.width ?? null, height: entry.height ?? null, alt } : null);
  const outfitSaved = record.stages?.outfit;
  const bodyEntry = outfitSaved?.status === 'done' ? cacheByKey.get(outfitSaved.key) : null;
  const chain = (record.faceChain ?? []).filter((c) => cacheByKey.has(c.key));
  const faceEntry = chain.length ? cacheByKey.get(chain.at(-1).key) : null;
  const appliedNames = chain.map((c) => snap.items[c.slot]?.name).filter(Boolean);

  const done = stages.filter((s) => s.status === 'done').length;
  const status = active ? 'running' : done === stages.length ? 'done' : done > 0 ? 'partial' : stages.some((s) => s.status === 'failed') ? 'failed' : 'idle';
  const failedRetryable = stages.some((s) => s.status === 'failed' && s.error?.retryable !== false);

  return {
    id: record.id,
    createdAt: record.createdAt, updatedAt: record.updatedAt,
    sampleModel,
    items: snap.items,
    totalPrice: snap.totalPrice, budgetInr: snap.budgetInr, score: snap.score,
    summary: snap.summary, reasons: snap.reasons, cautions: snap.cautions,
    status,
    active,
    canRetry: !active && (status === 'partial' || status === 'failed' ? failedRetryable : false),
    stages,
    images: {
      body: image(bodyEntry, `You wearing ${snap.items.outfit?.name ?? 'the outfit'}. AI preview.`),
      face: image(faceEntry, appliedNames.length ? `Close-up of you wearing ${join(appliedNames)}. AI preview.` : 'Close-up of you. AI preview.'),
    },
    unitsSpent: stages.reduce((n, s) => n + s.units, 0),
    label: AI_LABEL,
  };
}

/** The public view behind a share link: items and images only. No reasons, no skin profile, no session details. */
export function presentShared({ record, expiresAt, present }) {
  const snap = record.snapshot;
  return {
    items: Object.values(snap.items).map((i) => ({ type: i.type, name: i.name, price: i.price, productUrl: i.productUrl })),
    totalPrice: snap.totalPrice,
    expiresAt: new Date(expiresAt).toISOString(),
    hasBody: Boolean(present.images.body),
    hasFace: Boolean(present.images.face),
    alt: { body: present.images.body?.alt ?? null, face: present.images.face?.alt ?? null },
    label: AI_LABEL,
  };
}
