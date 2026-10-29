import { LIMITS } from '../../config/catalog.js';
import { parseCsv } from '../../lib/csv.js';
import { AppError } from '../../lib/errors.js';
import { FetchRefused } from '../../lib/safeFetch.js';
import { finaliseColours } from './colours.js';
import { checkImage } from './imageChecks.js';
import { canonicalRow, validateRow } from './validate.js';

const REQUIRED_COLUMNS = ['name', 'type', 'price', 'imageUrl'];
const COLUMN_LABELS = { name: 'name', type: 'type', price: 'price', imageUrl: 'image_url' };

/** Turns the uploaded text into raw row objects. File-level problems throw AppError(INVALID_FILE) with a plain message. */
export function parseRows({ format, content }) {
  const text = String(content ?? '');
  if (!text.trim()) throw new AppError('INVALID_FILE', 'The file is empty. Add a header row and at least one item.', 400);
  if (Buffer.byteLength(text) > LIMITS.maxFileBytes) throw new AppError('INVALID_FILE', `The file is larger than ${LIMITS.maxFileBytes / 1024} KB. Split it into smaller files.`, 413);

  let rows;
  const fmt = format === 'json' || format === 'csv' ? format : /^\s*[[{]/.test(text) ? 'json' : 'csv';
  if (fmt === 'json') {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new AppError('INVALID_FILE', `The JSON could not be read: ${e.message}.`, 400); }
    const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : null;
    if (!list) throw new AppError('INVALID_FILE', 'The JSON should be a list of items, or an object with an "items" list.', 400);
    rows = list.map((o, i) => (o && typeof o === 'object' && !Array.isArray(o) ? { ...o, __line: i + 1 } : { __line: i + 1, __bad: true }));
  } else {
    let parsed;
    try { parsed = parseCsv(text); } catch (e) { throw new AppError('INVALID_FILE', e.message, 400); }
    rows = parsed.rows;
    const seen = canonicalRow(Object.fromEntries(parsed.headers.filter(Boolean).map((h) => [h, 'x'])));
    const missing = REQUIRED_COLUMNS.filter((c) => !(c in seen));
    if (missing.length) {
      throw new AppError('INVALID_FILE', `The header row is missing: ${missing.map((m) => COLUMN_LABELS[m]).join(', ')}. Download the template to see the expected columns.`, 400, { missing: missing.map((m) => COLUMN_LABELS[m]) });
    }
  }
  if (!rows.length) throw new AppError('INVALID_FILE', 'No items found. Add at least one row under the header.', 400);
  if (rows.length > LIMITS.maxRowsPerImport) {
    throw new AppError('INVALID_FILE', `This file has ${rows.length} items. Import up to ${LIMITS.maxRowsPerImport} at a time and add the rest in a second import.`, 413, { rows: rows.length, max: LIMITS.maxRowsPerImport });
  }
  return { format: fmt, rows };
}

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => { while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

/**
 * Runs the whole import in memory and returns the report plus the items that passed. Nothing is written here.
 * Row-level problems never stop the import: valid rows come through, invalid ones are listed with what to fix.
 */
export function createImporter({ fetcher, storage, logger }) {
  /**
   * `store: false` keeps the image where it already is (the built-in catalog's photos are hosted already).
   * `lenient: true` is for that trusted file only: a photo that cannot be fetched or fails a size check still lets the item in,
   * with a warning, so a network blip at boot cannot leave the catalog empty.
   */
  async function processImage(item, catalogId, { store = true, lenient = false } = {}) {
    const errors = [];
    const warnings = [];
    const fallback = (message) => {
      const colourSource = item.colourSource === 'pending' ? 'none' : item.colourSource;
      return { item: { ...item, sourceImageUrl: item.imageUrl, colourSource }, errors: [], warnings: [...warnings, { field: 'image_url', message }] };
    };
    let downloaded;
    try {
      downloaded = await fetcher.fetchImage(item.imageUrl);
    } catch (e) {
      const msg = e instanceof FetchRefused ? e.message : 'Could not download the image.';
      if (!(e instanceof FetchRefused)) logger?.warn({ err: e.message }, 'catalog image fetch failed');
      if (lenient) return fallback(`${msg} The item was added without reading its photo.`);
      return { errors: [{ field: 'image_url', message: msg }], warnings };
    }
    const check = checkImage(downloaded.buffer, item.type);
    warnings.push(...check.warnings);
    if (check.errors.length) {
      if (lenient) return fallback(check.errors.map((e) => e.message).join(' '));
      return { errors: check.errors, warnings };
    }

    const next = { ...item, sourceImageUrl: item.imageUrl, imageWidth: check.info.width, imageHeight: check.info.height };
    let colours = item.colours;
    let colourSource = item.colourSource;
    if (colourSource === 'pending' && check.pixels?.colours.length) { colours = check.pixels.colours; colourSource = 'image'; }

    if (store && storage?.isConfigured?.()) {
      try {
        const saved = await storage.saveCatalogImage({ catalogId, itemId: item.itemId, buffer: downloaded.buffer });
        next.imageUrl = saved.url;
        next.imagePublicId = saved.publicId;
        if (colourSource === 'pending' && saved.colours?.length) {
          const fromStorage = finaliseColours(saved.colours);
          if (fromStorage.length) { colours = fromStorage; colourSource = 'image'; }
        }
      } catch (e) {
        logger?.error({ err: e.message }, 'catalog image store failed');
        return { errors: [{ field: 'image_url', message: 'We could not store this image just now. Try the import again.' }], warnings };
      }
    }
    if (colourSource === 'pending') {
      colourSource = 'none';
      warnings.push({ field: 'colours', message: 'We could not read this item’s colours from the photo. Add a colours column so it scores well.' });
    }
    return { item: { ...next, colours, colourSource }, errors, warnings };
  }

  /**
   * @param rows raw rows from parseRows.
   * @param existingIds ids this retailer already has in the catalog, prefix included (for add-vs-update wording).
   * @param idPrefix put in front of every item id so two retailers can both use "SKU-1". Reports show the id as written.
   */
  async function run({ rows, catalogId, existingIds = new Set(), idPrefix = '', store = true, lenient = false }) {
    const report = rows.map((raw, i) => ({ line: raw.__line ?? i + 1, id: null, name: null, status: 'rejected', updated: false, errors: [], warnings: [] }));
    const staged = [];
    const seen = new Map();
    rows.forEach((raw, i) => {
      if (raw.__bad) { report[i].errors.push({ field: null, message: 'This entry is not an object with item fields.' }); return; }
      const v = validateRow(raw, { index: i });
      report[i].warnings.push(...v.warnings);
      report[i].name = v.item?.name ?? (String(raw.name ?? raw.title ?? '').trim() || null);
      if (!v.item) { report[i].errors.push(...v.errors); return; }
      const sku = v.item.itemId;
      report[i].id = sku;
      if (seen.has(sku)) {
        report[i].errors.push({ field: 'id', message: `This id is already used on line ${report[seen.get(sku)].line}. Give each item its own id.` });
        return;
      }
      seen.set(sku, i);
      staged.push({ i, item: { ...v.item, sku, itemId: `${idPrefix}${sku}` } });
    });

    await mapLimit(staged, LIMITS.imageConcurrency, async ({ i, item }) => {
      const res = await processImage(item, catalogId, { store, lenient });
      report[i].warnings.push(...res.warnings);
      if (res.errors.length) { report[i].errors.push(...res.errors); return; }
      report[i].status = 'imported';
      report[i].updated = existingIds.has(item.itemId);
      staged.find((s) => s.i === i).done = res.item;
    });

    const items = staged.filter((s) => s.done).map((s) => s.done);
    const totals = {
      rows: rows.length,
      imported: items.length,
      updated: report.filter((r) => r.updated).length,
      rejected: report.filter((r) => r.status === 'rejected').length,
      withWarnings: report.filter((r) => r.status === 'imported' && r.warnings.length).length,
    };
    return { items, report: { totals, rows: report } };
  }

  return { run, parseRows };
}
