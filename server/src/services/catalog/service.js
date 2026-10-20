import { createHash, randomBytes } from 'node:crypto';
import { LIMITS } from '../../config/catalog.js';
import { AppError } from '../../lib/errors.js';
import { SAMPLE_CATALOG_ID, SAMPLE_CATALOG_VERSION, SAMPLE_ITEMS } from '../../data/sampleCatalog.js';

const hash = (token) => createHash('sha256').update(token).digest('hex');
const newToken = (prefix) => `${prefix}_${randomBytes(24).toString('base64url')}`;
const newId = () => randomBytes(9).toString('base64url');
const NOT_FOUND = () => new AppError('CATALOG_NOT_FOUND', 'That catalog link does not work. It may have expired or been deleted. Check the link or ask the retailer for a new one.', 404);

export function createCatalogService({ repo, importer, storage, metrics, config = {}, logger, now = () => new Date() }) {
  const ttlMs = (config.catalogTtlDays ?? LIMITS.catalogTtlDays) * 86_400_000;
  const publicBase = (config.publicClientUrl ?? '').replace(/\/$/, '');

  /** What other code and the API see. Relative sample image paths become absolute so the server can fetch them at render time. */
  const presentItem = (item, catalog) => ({
    id: item.itemId,
    catalogId: item.catalogId,
    type: item.type,
    name: item.name,
    price: item.price,
    imageUrl: item.imageUrl?.startsWith('/') && publicBase ? `${publicBase}${item.imageUrl}` : item.imageUrl,
    garmentCategory: item.garmentCategory ?? null,
    colours: (item.colours ?? []).map((c) => ({ hex: c.hex, family: c.family, share: c.share })),
    colourSource: item.colourSource,
    metalTone: item.metalTone ?? null,
    formality: item.formality,
    occasions: item.occasions ?? [],
    productUrl: item.productUrl ?? null,
    style: item.style ?? null,
    silhouette: item.silhouette ?? null,
    source: catalog.source === 'sample' ? 'sample' : 'merchant',
  });

  const presentCatalog = (catalog, itemCount, role = 'viewer') => ({
    id: catalog._id,
    name: catalog.name,
    source: catalog.source,
    role,
    itemCount,

    expiresAt: catalog.expiresAt ?? null,
  });

  const withItems = async (catalog, role) => {
    const list = await repo.listItems(catalog._id);
    const counts = list.reduce((acc, i) => ({ ...acc, [i.type]: (acc[i.type] ?? 0) + 1 }), { outfit: 0, necklace: 0, earrings: 0, lipstick: 0 });
    return { catalog: { ...presentCatalog(catalog, list.length, role), counts }, items: list.map((i) => presentItem(i, catalog)) };
  };

  async function ensureSample() {
    const existing = await repo.getCatalog(SAMPLE_CATALOG_ID);
    const count = existing ? await repo.countItems(SAMPLE_CATALOG_ID) : 0;
    if (existing?.version === SAMPLE_CATALOG_VERSION && count === SAMPLE_ITEMS.length) return { seeded: false };
    await repo.upsertCatalog({ _id: SAMPLE_CATALOG_ID, name: 'Sample catalog', source: 'sample', version: SAMPLE_CATALOG_VERSION, updatedAt: now() });
    await repo.deleteItems(SAMPLE_CATALOG_ID);
    await repo.upsertItems(SAMPLE_CATALOG_ID, SAMPLE_ITEMS.map(({ prompt, ...item }) => ({ ...item, addedAt: now() })));
    logger?.info({ items: SAMPLE_ITEMS.length, version: SAMPLE_CATALOG_VERSION }, 'sample catalog seeded');
    return { seeded: true };
  }

  async function resolve(token, { need = 'view' } = {}) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw NOT_FOUND();
    const catalog = await repo.findByHash(hash(token));
    if (!catalog || (catalog.expiresAt && catalog.expiresAt <= now())) throw NOT_FOUND();
    const role = catalog.manageHash === hash(token) ? 'owner' : 'viewer';
    if (need === 'manage' && role !== 'owner') throw new AppError('CATALOG_FORBIDDEN', 'This is the shopper link. Use your private manage link to change the catalog.', 403);
    return { catalog, role };
  }

  const touch = (catalogId) => repo.updateCatalog(catalogId, { updatedAt: now(), expiresAt: new Date(now().getTime() + ttlMs) });

  return {
    ensureSample,
    presentItem,

    async getSample() {
      const catalog = await repo.getCatalog(SAMPLE_CATALOG_ID);
      if (!catalog) throw new AppError('CATALOG_NOT_FOUND', 'The sample catalog is not loaded yet. Try again in a moment.', 503);
      return withItems(catalog, 'viewer');
    },

    async open(token) {
      const { catalog, role } = await resolve(token);
      return withItems(catalog, role);
    },

    /** Like open, but only the manage link works. Used by the retailer view. */
    async openOwned(token) {
      const { catalog, role } = await resolve(token, { need: 'manage' });
      return withItems(catalog, role);
    },

    /** Creates a retailer catalog from an uploaded file. Valid rows are imported at once; invalid ones are reported. */
    async createFromImport({ name, format, content }) {
      const cleanName = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanName.length < 2 || cleanName.length > LIMITS.catalogNameMax) throw new AppError('INVALID_INPUT', `Give the catalog a name of 2 to ${LIMITS.catalogNameMax} characters.`, 400, { field: 'name' });
      const parsed = importer.parseRows({ format, content });
      const catalogId = newId();
      const { items, report } = await importer.run({ rows: parsed.rows, catalogId });
      if (!items.length) {
        await storage?.deleteCatalog?.(catalogId).catch(() => {});
        throw new AppError('IMPORT_REJECTED', 'None of the rows could be imported. Fix the problems below and upload again.', 422, { report });
      }
      const tokens = { share: newToken('ensc'), manage: newToken('ensm') };
      const t = now();
      const catalog = await repo.insertCatalog({
        _id: catalogId, name: cleanName, source: 'merchant', shareHash: hash(tokens.share), manageHash: hash(tokens.manage),
        createdAt: t, updatedAt: t, expiresAt: new Date(t.getTime() + ttlMs),
      });
      await repo.upsertItems(catalogId, items.map((i) => ({ ...i, addedAt: t })));
      logger?.info({ catalogId, imported: items.length, rejected: report.totals.rejected }, 'catalog created');
      return { ...(await withItems(catalog, 'owner')), tokens, report };
    },

    /** Adds to (or replaces) an existing catalog. `append` updates items with the same id and adds new ones. */
    async importInto(token, { format, content, mode = 'append' }) {
      const { catalog } = await resolve(token, { need: 'manage' });
      if (mode !== 'append' && mode !== 'replace') throw new AppError('INVALID_INPUT', 'Mode must be append or replace.', 400, { field: 'mode' });
      const parsed = importer.parseRows({ format, content });
      const existing = await repo.itemIds(catalog._id);
      const { items, report } = await importer.run({ rows: parsed.rows, catalogId: catalog._id, existingIds: existing });
      if (!items.length) throw new AppError('IMPORT_REJECTED', 'None of the rows could be imported. Fix the problems below and upload again.', 422, { report });

      const incoming = new Set(items.map((i) => i.itemId));
      const finalCount = mode === 'replace' ? incoming.size : new Set([...existing, ...incoming]).size;
      if (finalCount > LIMITS.maxItemsPerCatalog) {
        // Remove only images stored for this attempt that no existing item uses.
        for (const it of items) if (it.imagePublicId && !existing.has(it.itemId)) await storage?.deleteCatalogImage?.(it.imagePublicId).catch(() => {});
        throw new AppError('CATALOG_FULL', `A catalog holds up to ${LIMITS.maxItemsPerCatalog} items. This import would make ${finalCount}. Remove some items first.`, 409, { max: LIMITS.maxItemsPerCatalog });
      }
      let removed = 0;
      if (mode === 'replace') {
        const gone = [...existing].filter((id) => !incoming.has(id));
        for (const id of gone) {
          const old = await repo.getItem(catalog._id, id);
          if (old?.imagePublicId) await storage?.deleteCatalogImage?.(old.imagePublicId).catch(() => {});
        }
        if (gone.length) await repo.deleteItems(catalog._id, gone);
        removed = gone.length;
      }
      const t = now();
      await repo.upsertItems(catalog._id, items.map((i) => ({ ...i, addedAt: t })));
      const fresh = await touch(catalog._id);
      report.totals.removed = removed;
      return { ...(await withItems(fresh, 'owner')), report };
    },

    async removeItem(token, itemId) {
      const { catalog } = await resolve(token, { need: 'manage' });
      const item = await repo.getItem(catalog._id, String(itemId));
      if (!item) throw new AppError('NOT_FOUND', 'That item is not in this catalog.', 404);
      if (item.imagePublicId) await storage?.deleteCatalogImage?.(item.imagePublicId).catch((e) => logger?.warn({ err: e.message }, 'catalog image delete failed'));
      await repo.deleteItem(catalog._id, item.itemId);
      return withItems(catalog, 'owner');
    },

    async removeCatalog(token) {
      const { catalog } = await resolve(token, { need: 'manage' });
      await deleteCatalogData(catalog._id);
      return { deleted: true };
    },

    /** Deletes expired merchant catalogs and their stored images. Safe to run often. */
    async sweepExpired() {
      const expired = await repo.listExpired(now());
      let swept = 0;
      for (const { _id } of expired) {
        try { await deleteCatalogData(_id); swept++; } catch (e) { logger?.error({ err: e.message, catalogId: _id }, 'catalog sweep failed'); }
      }
      return { swept };
    },

    /** For the planner (Stage 5): the items a session should be planned from. Falls back to the sample catalog. */
    async itemsForSession(session) {
      const wanted = session?.catalogId || SAMPLE_CATALOG_ID;
      let catalog = await repo.getCatalog(wanted);
      let fellBack = false;
      if (!catalog || (catalog.expiresAt && catalog.expiresAt <= now())) { catalog = await repo.getCatalog(SAMPLE_CATALOG_ID); fellBack = wanted !== SAMPLE_CATALOG_ID; }
      if (!catalog) throw new AppError('CATALOG_NOT_FOUND', 'No catalog is available yet. Try again in a moment.', 503);
      const { catalog: info, items } = await withItems(catalog, 'viewer');
      return { catalog: info, items, fellBack };
    },

    /** Validates a link for a shopper session and returns what to store on the session. */
    async selectionFor(token) {
      const { catalog } = await resolve(token);
      return { id: catalog._id, name: catalog.name };
    },
    async describe(catalogId) {
      const catalog = await repo.getCatalog(catalogId || SAMPLE_CATALOG_ID);
      if (!catalog || (catalog.expiresAt && catalog.expiresAt <= now())) return null;
      return presentCatalog(catalog, await repo.countItems(catalog._id));
    },
  };

  async function deleteCatalogData(catalogId) {
    await storage?.deleteCatalog?.(catalogId);
    await repo.deleteItems(catalogId);
    await repo.deleteCatalog(catalogId);
    await metrics?.deleteCatalog(catalogId); // its usage counters go with it
  }
}
