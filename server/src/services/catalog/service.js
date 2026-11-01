import { randomBytes } from 'node:crypto';
import { LIMITS, MAIN_CATALOG_ID, MAIN_CATALOG_NAME } from '../../config/catalog.js';
import { AppError } from '../../lib/errors.js';
import { SEED_ROWS, SEED_VERSION } from '../../data/seed.js';

const newId = () => randomBytes(9).toString('base64url');
const LEGACY_SAMPLE_ID = 'sample'; // the old built-in 30-item sample catalog, removed at boot
const MAX_STORED_PROBLEMS = 100;
const countByType = (list) => list.reduce((acc, i) => ({ ...acc, [i.type]: (acc[i.type] ?? 0) + 1 }), {
  outfit: 0, necklace: 0, earrings: 0, lipstick: 0, blush: 0, foundation: 0, eyewear: 0, watch: 0,
});
const cleanFileName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

/**
 * The shared catalog.
 *
 * There is exactly one catalog ('main'). It starts from data/seedCatalog.json, and every retailer's uploaded items are added
 * to it, so shoppers see them with no link to share. Each retailer item carries its owner, so a retailer can list, update
 * and delete only their own items. Deleting an item removes its database record, its stored image and its usage counters.
 */
export function createCatalogService({ repo, importer, storage, metrics, sessions, config = {}, logger, now = () => new Date(), seed = { rows: SEED_ROWS, version: SEED_VERSION } }) {
  const publicBase = (config.publicClientUrl ?? '').replace(/\/$/, '');

  /** What other code and the API see. Relative image paths (older data) become absolute so the server can fetch them. */
  const presentItem = (item) => ({
    id: item.itemId,
    catalogId: item.catalogId,
    sku: item.sku ?? item.itemId,
    type: item.type,
    gender: item.gender ?? 'unisex',
    category: item.category ?? null,
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
    source: item.retailerId ? 'retailer' : 'house',
    seller: item.retailerName || 'Ensemble',
  });

  const presentOwnItem = (item) => ({ ...presentItem(item), uploadId: item.uploadId ?? null, addedAt: item.addedAt ?? null });

  const presentCatalog = (catalog, list) => ({
    id: catalog._id,
    name: catalog.name,
    source: catalog.source,
    itemCount: list.length,
    counts: countByType(list),
    sellers: [...new Set(list.map((i) => i.retailerName || 'Ensemble'))].sort((a, b) => a.localeCompare(b)),
  });

  const presentUpload = (u, itemsNow) => ({
    id: u._id,
    fileName: u.fileName ?? '',
    mode: u.mode,
    status: u.status,
    createdAt: u.createdAt,
    totals: u.totals ?? {},
    problemCount: (u.problems ?? []).length,
    itemsNow,
  });

  /** Items a retailer owns. Their ids all start with the retailer's code and a dash, and only retailer items have an owner. */
  const storeItems = (list, code) => {
    const c = String(code ?? '').toLowerCase();
    return /^[a-z0-9]{2,12}$/.test(c) ? list.filter((i) => i.source === 'retailer' && i.id.startsWith(`${c}-`)) : [];
  };

  const withItems = async (catalog) => {
    const list = await repo.listItems(catalog._id);
    return { catalog: presentCatalog(catalog, list), items: list.map(presentItem) };
  };

  // ---- Boot: the built-in catalog ------------------------------------------------------------------------------

  /**
   * Makes sure the shared catalog exists and holds the seed file's items. Removes the old 30-item sample catalog. Safe to run
   * at every boot: when the seed file has not changed (and every item came in cleanly) nothing is touched.
   */
  async function ensureMain() {
    const legacy = await repo.getCatalog(LEGACY_SAMPLE_ID);
    if (legacy) { await deleteCatalogData(LEGACY_SAMPLE_ID); logger?.info('old sample catalog removed'); }

    const t = now();
    let main = await repo.getCatalog(MAIN_CATALOG_ID);
    if (!main) main = await repo.upsertCatalog({ _id: MAIN_CATALOG_ID, name: MAIN_CATALOG_NAME, source: 'main', version: null, createdAt: t, updatedAt: t, expiresAt: null });
    if (main.version === seed.version) return { seeded: false };

    const rows = seed.rows.map((o, i) => ({ ...o, __line: i + 1 }));
    const { items, report } = await importer.run({ rows, catalogId: MAIN_CATALOG_ID, store: false, lenient: true });
    if (report.totals.rejected) logger?.warn({ rejected: report.rows.filter((r) => r.status === 'rejected').map((r) => ({ line: r.line, errors: r.errors })) }, 'some seed rows were rejected');

    // Never overwrite a retailer's item that happens to share an id with a seed item.
    const taken = await repo.itemIds(MAIN_CATALOG_ID);
    const seedIds = await repo.seedItemIds(MAIN_CATALOG_ID);
    const fresh = items.filter((i) => !taken.has(i.itemId) || seedIds.has(i.itemId));
    const keep = new Set(fresh.map((i) => i.itemId));
    const stale = [...seedIds].filter((id) => !keep.has(id));
    if (stale.length) await repo.deleteItems(MAIN_CATALOG_ID, stale);
    await repo.upsertItems(MAIN_CATALOG_ID, fresh.map((i) => ({ ...i, origin: 'seed', retailerId: null, retailerName: null, uploadId: null, addedAt: t })));

    // A seed photo that could not be read stays flagged, so the next boot tries again instead of trusting a half-read item.
    const clean = report.totals.rejected === 0 && !report.rows.some((r) => r.warnings.some((w) => w.field === 'image_url'));
    await repo.updateCatalog(MAIN_CATALOG_ID, { version: clean ? seed.version : `${seed.version}!retry`, updatedAt: t });
    logger?.info({ items: fresh.length, removed: stale.length, clean }, 'built-in catalog applied');
    return { seeded: true, items: fresh.length, clean };
  }

  /** The shared catalog's record. Created empty if it is missing, so reading never fails just because seeding has not run yet. */
  async function mainCatalog() {
    const catalog = await repo.getCatalog(MAIN_CATALOG_ID);
    if (catalog) return catalog;
    const t = now();
    return repo.upsertCatalog({ _id: MAIN_CATALOG_ID, name: MAIN_CATALOG_NAME, source: 'main', version: null, createdAt: t, updatedAt: t, expiresAt: null });
  }

  // ---- Retailer-owned items ------------------------------------------------------------------------------------

  /** Deletes items one at a time: stored image first, then the record, so a storage failure leaves the item in place to retry. */
  async function purgeItems(list) {
    const removed = [];
    try {
      for (const item of list) {
        if (item.imagePublicId) await storage?.deleteCatalogImage?.(item.imagePublicId);
        await repo.deleteItem(MAIN_CATALOG_ID, item.itemId);
        removed.push(item.itemId);
      }
    } catch (e) {
      logger?.error({ err: e.message }, 'catalog item delete failed');
      await afterRemoved(removed);
      throw new AppError('DELETE_FAILED', 'We could not remove an image just now. Nothing else was lost. Try again in a moment.', 502, { removed: removed.length });
    }
    await afterRemoved(removed);
    return removed;
  }

  /** Everything else that remembers an item id: usage counters and shoppers' "never show me this" lists. */
  async function afterRemoved(ids) {
    if (!ids.length) return;
    await Promise.allSettled([metrics?.removeItems?.(MAIN_CATALOG_ID, ids), sessions?.dropExcludedItems?.(ids)]);
    await repo.updateCatalog(MAIN_CATALOG_ID, { updatedAt: now() });
  }

  async function dashboard(account) {
    const rid = account._id;
    const [items, uploads, counts] = await Promise.all([
      repo.listItemsByRetailer(MAIN_CATALOG_ID, rid),
      repo.listUploads(rid, 100),
      repo.itemCountsByUpload(MAIN_CATALOG_ID, rid),
    ]);
    return {
      store: { code: account.retailer?.code ?? null },
      summary: { items: items.length, counts: countByType(items), uploads: uploads.length, limit: LIMITS.maxItemsPerRetailer },
      items: items.map(presentOwnItem),
      uploads: uploads.map((u) => presentUpload(u, counts[u._id] ?? 0)),
    };
  }

  const retailerOf = (account) => {
    if (account?.role !== 'retailer' || !account.retailer?.code) throw new AppError('FORBIDDEN', 'This needs a retailer account.', 403);
    return account.retailer;
  };

  async function recordUpload(account, { uploadId, fileName, format, mode, status, report, removed = 0 }) {
    const problems = report.rows
      .filter((r) => r.status === 'rejected' || r.warnings.length)
      .slice(0, MAX_STORED_PROBLEMS)
      .map((r) => ({ line: r.line, id: r.id, name: r.name, status: r.status, updated: r.updated, errors: r.errors, warnings: r.warnings }));
    return repo.insertUpload({
      _id: uploadId, retailerId: account._id, fileName: cleanFileName(fileName), format, mode, status, createdAt: now(),
      totals: { ...report.totals, removed }, problems,
    });
  }

  return {
    ensureMain,
    presentItem,

    /** The shared catalog, for anyone. */
    async getMain() { return withItems(await mainCatalog()); },

    /**
     * For the planner, agent and renderer: the items a session plans from. Normally the whole shared catalog, so one look can mix
     * a dress from one retailer with a necklace from another. A session that opened a retailer's store link plans only from that
     * retailer's items; if the store has nothing left it falls back to the whole catalog (`fellBack: true`).
     */
    async itemsForSession(session) {
      const all = await withItems(await mainCatalog());
      const code = session?.storeCode;
      if (!code) return { catalog: all.catalog, items: all.items, fellBack: false };
      const items = storeItems(all.items, code);
      if (!items.length) return { catalog: all.catalog, items: all.items, fellBack: true };
      return { catalog: { ...all.catalog, name: items[0].seller, itemCount: items.length, counts: countByType(items), sellers: [items[0].seller] }, items, fellBack: false };
    },

    /** A retailer's public store: the name and every item they have in the catalog. Anyone with the code can open it. */
    async getStore(code) {
      const { items } = await withItems(await mainCatalog());
      const own = storeItems(items, code);
      if (!own.length) throw new AppError('STORE_NOT_FOUND', 'We could not find that store, or it has no items right now.', 404);
      return { store: { code, name: own[0].seller, itemCount: own.length, counts: countByType(own) }, items: own };
    },

    dashboard,

    /** A retailer's items and upload history. */
    async openDashboard(account) { retailerOf(account); return dashboard(account); },

    /**
     * Adds a file's items to the shared catalog under this retailer. `append` updates items with the same id and adds new ones;
     * `replace` also removes this retailer's items that are not in the file. Valid rows are live at once; bad rows are reported.
     */
    async importForRetailer(account, { format, content, mode = 'append', fileName = '' }) {
      const retailer = retailerOf(account);
      if (mode !== 'append' && mode !== 'replace') throw new AppError('INVALID_INPUT', 'Mode must be append or replace.', 400, { field: 'mode' });
      const parsed = importer.parseRows({ format, content });
      const prefix = `${retailer.code}-`;
      const existing = await repo.itemIdsByRetailer(MAIN_CATALOG_ID, account._id);
      const uploadId = newId();
      const { items, report } = await importer.run({ rows: parsed.rows, catalogId: MAIN_CATALOG_ID, existingIds: existing, idPrefix: prefix });

      if (!items.length) {
        await recordUpload(account, { uploadId, fileName, format: parsed.format, mode, status: 'rejected', report });
        throw new AppError('IMPORT_REJECTED', 'None of the rows could be imported. Fix the problems below and upload again.', 422, { report, uploadId });
      }

      const incoming = new Set(items.map((i) => i.itemId));
      const finalCount = mode === 'replace' ? incoming.size : new Set([...existing, ...incoming]).size;
      if (finalCount > LIMITS.maxItemsPerRetailer) {
        // Remove only images stored for this attempt that no existing item uses.
        for (const it of items) if (it.imagePublicId && !existing.has(it.itemId)) await storage?.deleteCatalogImage?.(it.imagePublicId).catch(() => {});
        throw new AppError('CATALOG_FULL', `You can have up to ${LIMITS.maxItemsPerRetailer} items in the catalog. This upload would make ${finalCount}. Delete some items first.`, 409, { max: LIMITS.maxItemsPerRetailer });
      }

      let removed = 0;
      if (mode === 'replace') {
        const gone = [];
        for (const id of existing) if (!incoming.has(id)) gone.push(await repo.getItem(MAIN_CATALOG_ID, id));
        removed = (await purgeItems(gone.filter(Boolean))).length;
      }

      const t = now();
      await repo.upsertItems(MAIN_CATALOG_ID, items.map((i) => ({
        ...i, origin: 'retailer', retailerId: account._id, retailerName: retailer.businessName, uploadId, addedAt: t,
      })));
      await repo.updateCatalog(MAIN_CATALOG_ID, { updatedAt: t });
      report.totals.removed = removed;
      const upload = await recordUpload(account, { uploadId, fileName, format: parsed.format, mode, status: 'imported', report, removed });
      logger?.info({ retailer: account.retailer.code, uploadId, imported: items.length, rejected: report.totals.rejected, removed }, 'retailer upload added to the catalog');
      const board = await dashboard(account);
      return { report, uploadId: upload._id, ...board };
    },

    /** Delete one of this retailer's items everywhere: catalog, image storage, usage counters, shoppers' exclusion lists. */
    async removeItem(account, itemId) {
      retailerOf(account);
      const item = await repo.getItem(MAIN_CATALOG_ID, String(itemId));
      if (!item || item.retailerId !== account._id) throw new AppError('NOT_FOUND', 'That item is not in your catalog.', 404);
      await purgeItems([item]);
      return dashboard(account);
    },

    /** Delete every item that this upload last wrote, then the upload's record. Items a later upload updated stay with that upload. */
    async removeUpload(account, uploadId) {
      retailerOf(account);
      const upload = await repo.getUpload(String(uploadId), account._id);
      if (!upload) throw new AppError('NOT_FOUND', 'That upload was not found.', 404);
      const items = await repo.listItemsByUpload(MAIN_CATALOG_ID, account._id, upload._id);
      await purgeItems(items);
      await repo.deleteUpload(upload._id);
      return dashboard(account);
    },

    /** The stored problems of one upload, for its report. */
    async uploadReport(account, uploadId) {
      retailerOf(account);
      const upload = await repo.getUpload(String(uploadId), account._id);
      if (!upload) throw new AppError('NOT_FOUND', 'That upload was not found.', 404);
      const rows = (upload.problems ?? []).map((p) => ({ ...p, errors: p.errors ?? [], warnings: p.warnings ?? [] }));
      return { upload: presentUpload(upload, 0), report: { totals: { ...upload.totals }, rows } };
    },

    /** Part of deleting a retailer account: all of their items and upload history go too. */
    async removeAllForRetailer(account) {
      retailerOf(account);
      await purgeItems(await repo.listItemsByRetailer(MAIN_CATALOG_ID, account._id));
      await repo.deleteUploadsByRetailer(account._id);
    },

    /** A retailer's own items, for their usage view. */
    async itemsOf(account) {
      retailerOf(account);
      return (await repo.listItemsByRetailer(MAIN_CATALOG_ID, account._id)).map(presentItem);
    },

    /** Deletes expired private catalogs left over from before accounts existed, and their stored images. Safe to run often. */
    async sweepExpired() {
      const expired = await repo.listExpired(now());
      let swept = 0;
      for (const { _id } of expired) {
        try { await deleteCatalogData(_id); swept++; } catch (e) { logger?.error({ err: e.message, catalogId: _id }, 'catalog sweep failed'); }
      }
      return { swept };
    },
  };

  async function deleteCatalogData(catalogId) {
    await storage?.deleteCatalog?.(catalogId);
    await repo.deleteItems(catalogId);
    await repo.deleteCatalog(catalogId);
    await metrics?.deleteCatalog(catalogId); // its usage counters go with it
  }
}
